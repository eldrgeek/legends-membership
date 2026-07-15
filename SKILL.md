---
name: legends-change-management
description: >
  End-to-end operating procedure for handling a Legends change request —
  "Greg wants X changed" from arrival to shipped-and-reviewed. Use this skill
  whenever a task involves changing the Legends membership site
  (legends-membership.netlify.app / ~/Projects/legends-membership-site):
  a Greg request batch, a Bill-intake change request, a bug fix, a content
  edit, or reviewing/recording something already shipped. Covers where
  requests arrive, the change_requests queue and its status pipeline, the
  worktree + test-gate + Netlify deploy workflow, the shared-Supabase auth
  gotcha, visual verification, and how shipped changes get recorded
  (Supabase changelog, ESTATE.md, status back to Mike/Greg).
---

# Legends change management — the operating loop

Legends runs **demand-driven off Greg's change queue**. There is no roadmap
doc. The unit of work is a change request; the loop is:
**request arrives → queue row → build → deploy → Greg reviews with Quinn →
recorded**. This file documents what actually happens (mined from git
history, ESTATE.md, and the daemon source), not an idealized process.

Read `CLAUDE.md` and `BREADCRUMBS.md` in this repo first if you haven't.
Repo: `~/Projects/legends-membership-site` · Live: https://legends-membership.netlify.app
GitHub: `eldrgeek/legends-membership` · Netlify site ID `47a0da43-cc93-435d-964b-79dc3ed04c4e`.

## 1. Where requests arrive (four front doors, one queue)

| Door | Mechanism | Lands as |
|---|---|---|
| **Greg → Mike, relayed** | Calls/texts/email; Mike opens a session with "Greg wants X" — this is how every big batch (jun-26 bubble round, jul-02 4-item round, jul-03 phone+scholarships round) actually arrived | You execute manually (§3), then **backfill** the queue (§5) |
| **Bill on-site intake** | Bill's feedback intents POST to `netlify/functions/submit-intake.js` | `public.change_requests` row, `status='new'`, `source='bill'` |
| **Email** | Mail to `claude@mike-wolf.com`; the email daemon (`~/Projects/claude-email-daemon/daemon.py`) mirrors it into the queue | `change_requests` row, `status='new'` |
| **bugs.html / features.html** | `submit-recommendation.js` → VPS `api/recommendations?app=legends`; triaged in the Coach-persona flow, surfaced on `recommendations.html` | Older recommendations pipeline — separate from `change_requests` |

The queue is `public.change_requests` in Supabase project **omfwcodoimjmbrhssvfl**
(shared with Playmaker — see §6). Greg's review surface is
`admin-changelog.html` (the Change Log, with the **Quinn** review persona).
Admins see a gold "Review items (N)" nav button (`js/admin-review-nav.js`)
whenever anything is `new / awaiting-approval / awaiting-review / blocked`.

## 2. The automated pipeline (email daemon, every ~5 min)

`process_change_queue` in `~/Projects/claude-email-daemon/daemon.py`:

1. Poll `change_requests` where `status='new'` (skips `source='test'`).
2. **Vet** each via the reversibility second-opinion rubric →
   `vet: {reversible, risk, reason, needs_approval}`.
3. **Route by requester role**: owner/admin (`mw@mike-wolf.com`,
   `gfos44@gmail.com`) → auto `approved`. Members: reversible + low-risk →
   `approved`; otherwise → `awaiting-approval` + a deep-linked approval email
   to Greg (`admin-changelog.html#req-<id>`).
4. Poll `status='approved'` → `_dispatch_change_request`: fires
   **cc-dispatch** with `--workdir` this repo and a prompt embedding the
   **deploy policy** (below). Records `head_before`.
5. Completion pass: worker report lands → if HEAD moved, capture
   `commit_sha` (enables one-click **Revert** in the Change Log) and flip to
   `awaiting-review` + notify; if the report reads blocked and no commit,
   flip to `blocked` with the reason in `context`.
6. Greg opens the Change Log; Quinn walks him through each item — **default
   view is the live page with the change location highlighted; diff is the
   secondary toggle** (commit `06e08c4b`). He clicks **Accept**
   (→ `status='accepted'`) or **Needs refinement** (note goes back around).
   Branch-preview items show **Accept & publish**, which composes an
   approval email to the build agent.

**Deploy policy the daemon gives workers** (apply it yourself too):
NON-BREAKING (content/text/styling that can't break nav, build, or existing
functionality) → commit and push to `master`; Netlify CD deploys it.
BREAKING (remove/rename/move a page, nav/structure, JS/logic that could
error, layout overhauls, anything you're unsure about) → push a
`preview/<task>` branch, report the preview URL, production untouched until
a human Accepts. **When in doubt, treat it as breaking.**

## 3. The manual batch flow (how Greg rounds actually ship)

This is what the jul-01→03 rounds really looked like:

1. **Work in a worktree, never the main tree.** The main tree is parked on
   `app-roles-admin-model` — an explicit **do-not-deploy** branch (WORKQUEUE
   §2). Existing worktrees: `~/Projects/legends-greg-changes` (Greg batches),
   `~/Projects/legends-purvis-short`, `~/Projects/.nightly-legends`
   (`git worktree list` from this repo shows them). Make a new one per batch:
   `git worktree add ~/Projects/legends-<batch> -b <batch>-<date> master`.
2. **Make the changes, and add tests with them.** The suite is the canon
   enforcer — e.g. NBRPA→"Legends of Basketball" naming, Bill cue-lint,
   nav structure. Round 2 shipped **+15 tests → 865 pass / 0 fail**; match
   that habit. See `TESTING.md` for the six layers.
3. **Run the gate**: `npm test` (~8 s, no network). In dispatched /
   thin-PATH shells use `scripts/with-node.sh npm test` (nvm-aware).
   If you touched any Bill narration **words** (not just `[[cues]]`), re-run
   `node scripts/gen-tour-audio.mjs` first or the audio-hash lint fails
   (see `CHOREOGRAPHY.md` rule 1).
4. **Apply any Supabase migrations by hand** in the SQL editor
   (`migrations/*.sql`). They are **deliberately not run on deploy**.
5. **Ship**: merge/fast-forward to `master`, push `origin master` → Netlify
   CD builds (`node scripts/build-nav.mjs`) and deploys. For a manual deploy
   use `scripts/deploy.sh` **only** — it hardcodes the site ID so you can
   never cross-deploy onto another SOMA Netlify site. Never bare
   `netlify deploy --prod`.
6. **Verify** (§7), **record** (§5), **report** (§8).

## 4. Status vocabulary

`new → approved | awaiting-approval → (dispatch) → awaiting-review | blocked → accepted | deferred | rejected`
(`shipped` appears in the recommendations pipeline, not `change_requests`.)
Legacy pre-pipeline entries were migrated with `status='accepted'`
(`migrations/changelog_to_change_requests.sql`).

## 5. Recording shipped changes (three ledgers, all required)

1. **The Change Log** (`change_requests`). Automated dispatches self-record.
   Manual batches must be **backfilled** so Greg's review queue is complete —
   pattern: a `migrations/changelog-batch-<date>.sql` of idempotent
   `INSERT ... WHERE NOT EXISTS` rows keyed on `commit_sha`, applied in the
   Supabase SQL editor (precedent: `changelog-batch-jun26.sql` … `jun27c.sql`,
   commits `91c8c773`, `05369a66`). Write the *enriched* what-changed from
   `git show --stat`, not a vibe summary — hand-written summaries have
   drifted before (see the cl-003/cl-004 corrections in
   `changelog_to_change_requests.sql`).
2. **ESTATE.md changelog** (`~/Projects/ESTATE.md`): one dated line per
   shipped round, same session that shipped it. Include the commit SHA and
   the test count (house style: see the 2026-07-02/03 Legends entries).
3. **Status back to humans** — §8.

## 6. Shared-Supabase auth gotcha (read before touching auth or deploy URLs)

Legends and **Playmaker share ONE Supabase project** (`omfwcodoimjmbrhssvfl`),
documented in `~/Projects/playmaker/CLAUDE.md`. The project's Auth **Site URL
points at Legends**. Consequences on the Legends side:

- **Never change the Site URL and never overwrite `uri_allow_list`** — only
  append (Management API `PATCH /v1/projects/omfwcodoimjmbrhssvfl/config/auth`).
  Clobbering it bounces Playmaker sign-ins; changing Site URL breaks both apps.
- Auth schema changes (roles, RLS on shared tables like `app_roles`) affect
  Playmaker too. The `app_roles` admin-gate work sits on branch `f49f1d5e`
  with an explicit do-not-deploy flag for exactly this reason.
- **Netlify Identity is permanently removed** (2026-06-05). SOMA Auth
  (Supabase magic-link) only — `AUTH-SETUP.md`; this repo is the reference
  implementation. Never re-add Identity; 13 pages still carry dead Identity
  script tags awaiting cleanup (WQ-3) — don't imitate them.

## 7. Verification expectations

- `npm test` before every push (blocking). `npm run test:e2e` if you touched
  Supabase-backed features (needs `SUPABASE_SERVICE_ROLE_KEY`).
- `npm run verify:deploy` **after every push and after every soma-guide
  engine change** — diffs every live surface against local sources and
  probes the feedback + inference endpoints. Exit 1 = drift.
- **Visual verification in a real browser** on the production URL, not just
  curl: load the changed pages, exercise the change, and check Ask-Bill
  still opens (it's a 4-link external chain — soma-guide CDN, bill-talk
  el-proxy, ElevenLabs agent, VPS infer/ask; `BREADCRUMBS.md` has the
  what-breaks-what table and `RECIPES.md` the diagnostic curls). Yeshie or
  the `verify`/e2e skills are the house tools for this. The estate has been
  burned by "SHIPPED" headlines nobody eyeballed (WQ-1).
- Remember Greg reviews on the **live page**; if your change is live but
  ugly or half-rendered, that *is* the review experience.

## 8. Closing the loop with Mike and Greg

- **Mike**: report in-session, or `cc hud-ask` / Pulse for fire-and-forget
  completions. Include commit SHA, test count, live URL, and anything that
  needs ratification (judgment calls get a "for Greg to ratify" flag — see
  the Scholarship-America precedent in ESTATE 2026-07-02).
- **Greg**: never contact him directly (Coach-persona boundary). He gets the
  deep-linked approval emails from the daemon and reviews in the Change Log
  with Quinn. Your job is to make sure his queue rows exist (§5.1) and the
  live page he'll review is right (§7).
- Greg approves; Coach/Quinn/you never do. No timeline commitments —
  Greg decides when things ship to *people* even after they ship to prod.

## Known doc-vs-reality drift (as of 2026-07-03)

- `RECIPES.md` "Deploying site changes" still names `fix/ask-bill` as the
  current branch and a preview-promote flow — stale; the real flow is §3.
- `~/Projects/SOMA/personas/coach.md` still says the site uses Netlify
  Identity — removed 2026-06-05.
- The main tree sits on `app-roles-admin-model` (do-not-deploy), so "cd into
  the repo and push" is a trap — worktree first (§3.1).

---

*Authorship: drafted 2026-07-03 by Dee (Claude Code, Sonnet) for Claude-COO,
from WORKQUEUE WQ-4 (Legends change-management operating skill). Sources:
this repo's docs + git history, `claude-email-daemon/daemon.py`,
`playmaker/CLAUDE.md`, `ESTATE.md` changelog, `_estate/WORKQUEUE.md`.
Mike Wolf: CEO/owner; procedure reflects practice through the 2026-07-03
round-2 ship.*
