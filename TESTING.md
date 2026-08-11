# Testing

Four complementary layers guard this site and its AI guide (Bill). Each layer
catches a class of failure the others can't.

```sh
npm install
npm test                 # layers 2–4 (no network, no browser; ~8s)
npm run verify:deploy    # layer 5 — live drift check (network; ~5s)
```

Production deploys from GitHub through Netlify continuous deployment. Local
fixes are not live until they are committed and pushed to `origin/master`.

## Layer 1 — SOMA engine behavior (lives in soma-platform)

The soma-guide engine is shared across SOMA sites and tests itself:

```sh
cd ~/Projects/soma-platform/packages/soma-guide && npm test    # 291 tests
```

- `tests/soma-guide.test.js` — walkthrough navigation, TTS, resume, sub-steps,
  navigator, state-version guard, question classifier, inference path.
- `tests/engine-behaviors.test.js` — routing precedence (feedback → scope
  guard → walkthrough → inference), keyword matching rules, feedback buttons
  never pre-start the voice session, stop-tour restores the starting state
  (page + scroll + widget panel), and tour choreography (cursor glide →
  highlight on arrival → click ripple at narration end → navigate).

## Layer 2 — Site DOM regression (`tests/suite.test.js`)

Parses every page with jsdom (no scripts) and applies the auth-UI logic with
mock users: login/sign-out/admin gating, nav dropdown structure (scoped per
dropdown — there are two), NBRPA copy rules, Leslie proposals page, Ask Bill
presence on all pages.

## Layer 3 — Bill costume validation (`tests/bill-costume.test.js`)

Lints `js/legends-guide-config.js` against the real pages and the real engine:

- **Keyword hygiene** — no conversational-filler keywords (the class of bug
  where every question triggered the find-member tour), no cross-walkthrough
  shadowing, nothing that shadows feedback intents.
- **Selector validity** — every walkthrough step's `target`,
  `requires.dropdown`, and `[[cue]]` selector (see CHOREOGRAPHY.md) is
  resolved against the actual HTML page that step plays on (page context
  tracked through the tour like the engine does); cue verbs are checked
  against the engine's vocabulary.
- **Audio sync** — every narration's djb2 hash has a pre-generated clip in
  `audio/tour/`. Fails when narration is edited without re-running
  `node scripts/gen-tour-audio.mjs` (which would otherwise silently fall
  back to paid live TTS).
- siteMap paths exist; scope guard doesn't swallow on-domain questions.

## Layer 4 — Conversation scenarios (`tests/bill-conversations.test.js`)

The real engine + the real Bill config in jsdom, table-driven:
**"member types X → Bill must do Y"** where Y ∈ tour / feedback form /
deflect / inference / voice-agent fallthrough. Also end-to-end flows: the
🐛 button renders the form with no ElevenLabs greeting hijack, form submit
POSTs to the Netlify function, stop-tour returns to the starting page, and
voice-input affordances render.

**When a routing bug ships, add the failing utterance to `SCENARIOS` first,
then fix.** That table is the regression contract for Bill's brain.

The engine source is resolved from `$SOMA_GUIDE_SRC`, then
`vendor/soma-guide/soma-guide.js` (what production actually serves), then a
sibling `soma-platform` checkout.

## Layer 4b — Dependency failures (`npm run test:dependency-failures`)

**The only failure-path suite in this repo.** Every other layer proves the happy
path. This one blocks each external dependency individually — guide bundle,
bill-talk, ElevenLabs, VPS `/infer/ask`, and all four at once — and asserts the
intended degradation.

The contract, for every single-dependency outage:
- a member can still reach core content (nav + readable body)
- a member can still submit a request (`bugs.html` → recommendations API)
- the degradation is intentional, not an undefined-global accident

Voice and inference may degrade. Navigation, reading and submitting must not.

Written 2026-08-11 after `soma-guide.netlify.app` was found 404 in production —
`window.somaGuide` undefined for every member, the "Ask Bill →" button doing
nothing — with no test, alarm, or human noticing. It was verified RED against
the pre-fix tree before the fix landed; a matrix that was green beforehand is
not a matrix.

## Layer 5 — Deploy drift (`npm run verify:deploy`)

The engine is now vendored and ships via git CD with the rest of the site.
`tools/verify-deploy.mjs` diffs every live surface against local sources
(vendored engine js/css, config, knowledge pack, resilience layer), asserts no
page still references the dead soma-guide CDN, warns if the vendored engine has
drifted from `soma-platform`, and probes the submit-feedback function and the
inference endpoint. Exit 1 on drift. Run after every push.
Set `DEPLOY_URL` to point it at a Netlify deploy preview instead of production.

## Layer 6 — Supabase E2E (`npm run test:e2e`)

`tools/regression-test.mjs` — live-service checks (needs
`SUPABASE_SERVICE_ROLE_KEY`).
