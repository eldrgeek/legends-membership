# Legends Membership Site — Nightly Deep Audit
**Date:** 2026-07-01/02 (overnight, authorized by Mike)
**Branch:** `nightly/legends-improvements` (worktree at `/Users/mikewolf/Projects/.nightly-legends`, based on `master`)
**Base commit:** `4b4a40b2` (origin/master HEAD)
**Preview:** https://6a45afb795ab540ce0b22f2c--legends-membership.netlify.app
**Live site:** https://legends-membership.netlify.app

## Headline

The site is in genuinely good health. Baseline: `npm test` → **860/863 passing, 0 failing, 3 skipped**. `node tools/verify-deploy.mjs` → all live surfaces (CDN engine, Bill config, knowledge pack, feedback endpoint, inference endpoint) match source, zero drift. No auth bugs found. No broken pages (all 25 top-level HTML pages + 11 member profiles return 200). This is not a site that's quietly rotting — the known reputation ("SOMA reference app") holds up under a real audit.

Found one genuine, non-trivial content bug (missing roster card — see needs-Mike-decision) and fixed two safe, high-visibility cosmetic issues. Everything else checked out clean or was already handled well.

---

## FIXED (safe, committed, verified on preview)

1. **Stale copyright year (© 2025 → © 2026), 29 files.**
   Every page's footer said "© 2025" though it's mid-2026. No test pinned the year. Fixed with a scoped `sed` across all `*.html` + `members/*.html`. Verified zero remaining `© 2025` refs; verified `© 2026` live on preview (`index.html`, `about.html` spot-checked via curl).
   Commit: `6bc340b3` — `fix(legends): update stale 2025 copyright year to 2026 across all pages`

2. **Dev-test HTML comment left in shipped markup.**
   `index.html` had `<!-- cd-test Mon Jun 1 19:48:03 EDT 2026 -->` after `</html>` — harmless but unprofessional if anyone views source. Removed in the same commit. Verified gone on preview (`grep -c cd-test` → 0).

Both changes: build ran clean (`node scripts/build-nav.mjs` → 0 pages regenerated, i.e. no drift introduced), full test suite re-run after edits → still 860/863 pass / 0 fail, draft-deployed and spot-verified live.

---

## Investigated and found NOT broken (worth recording so nobody re-chases these)

- **`soma-edit.js` dead-script refs** (the "known estate-wide bug" flagged in the task brief): **zero references** to `soma-edit.js` anywhere in this repo's HTML/JS, on `master`, or in the live-deployed homepage. Direct `curl` to `/soma-edit.js` on the live site does 404, but nothing links to it. Either this repo was already cleaned up, or the bug lives in a different SOMA property. Not reproducible here — don't waste more cycles searching this repo for it.
- **Netlify Identity script tag**: present but *commented out* on 13 pages (`<!-- <script src="https://identity.netlify.com/...">  -->`). Confirmed dead comment, not an active load — doesn't violate the "never re-add it" rule since it isn't active. Low-priority cosmetic cleanup candidate (could be stripped for repo hygiene) but not a live bug. Left as-is.
- **`infer/ask` and `el-proxy` endpoints "404"/"400" on bare GET/empty POST**: both are healthy — they just require a real payload. `verify:deploy` confirms `infer/ask` responding correctly; a proper POST to `el-proxy` returns the expected validation error, not a crash. BREADCRUMBS.md's dependency chain is accurate and none of the 4 links are down.
- **`bill-talk.netlify.app` nav link** (`href="https://bill-talk.netlify.app"` + `onclick` override to open the in-page widget): looked like a race-condition bug at first (if `soma-guide.js`, a `type="module"` script, hasn't evaluated yet, the user would navigate away instead of opening the widget). Checked the actual fallback destination — it's a real, on-brand "Bill — NBRPA Member Services" landing page, not a 404 or blank page. This is **intentional graceful degradation**, not a bug. No fix needed.
- **Images/alt text**: the entire site uses zero `<img>` tags (emoji + CSS icons only) — nothing to break, no alt-text gaps possible.
- **Auth flow** (`js/soma-auth.js`, `login.html`, read-only per instructions): thorough, well-commented, defaults to magic-link with copy explicitly aimed at non-technical users ("No password needed. Best for most committee members."), has phone/OAuth/password fallbacks, tab-identity isolation (prevents one browser tab's login from clobbering another's), password recovery flow, graceful degradation if Supabase config is missing. 18 passing tab-identity tests. This *is* the reference implementation it's reputed to be — no changes recommended.
- **Typos**: grepped for the common list (recieve, seperate, teh, commitee, etc.) across all pages — zero hits.
- **Empty states**: recommendations/bugs/features pages all have warm, encouraging empty-state copy ("No feature requests yet. Be the first!") rather than bare "no data" — good UX already in place.
- **Mobile viewport**: real hamburger nav with proper breakpoints (`@media max-width: 700px` etc.), accessible collapse behavior, brand logo shrinks to an icon-only mark on small screens. No sanity issues found.
- **Performance**: homepage is 13.7KB / 130ms to fetch. No JS bundle is alarmingly large (`legends-guide-config.js` at 32KB is the biggest local script, reasonable for a rich persona+walkthrough config). No obvious render-blocking or bloat.

---

## SAFE-BUT-REVIEW (not fixed — judgment calls, low risk either way)

- **Netlify Identity commented-out script tags** (13 pages): could be stripped entirely as repo hygiene since Identity is permanently retired, but they're inert and removing them is pure tidiness, not a fix. Left alone to avoid unnecessary diff noise; flag if you want it cleaned in a follow-up pass.

---

## NEEDS-MIKE-DECISION

### 1. Missing/inconsistent committee roster — Choo Smith

**This is the most substantive finding of the audit.** Three different pages state three different committee sizes, and one committee member has a published profile page with no way to reach it:

- `index.html`: "**Nine** dedicated committee members" / "**Nine** Legends. One Mission." / "nine former NBA, ABA, WNBA, and Harlem Globetrotter alumni"
- `about.html`: "A **nine-member** committee of former professional basketball players"
- `members.html`: "**Ten** distinguished alumni serving..." / "Our **ten** committee members bring decades..." — but only shows **10 member-cards** in the grid (Greg Foster, Major Jones, Lionel Hollins, Bruce Capers, Herb Lang, Leslie Johnson, George Tinsley, Willie Davis, Mo Evans, Purvis Short)
- **Choo Smith** appears in the Committee Contact Directory table on `members.html` (line ~333, listed as "Committee Member," email `Choo@choosmith.com`) **and** has a fully-written profile page at `members/choo-smith.html` — complete bio, sidebar, contact info, matching every other member page's structure — but has **zero entry point**: no card in the `members.html` grid, no link anywhere on the site reaches it except direct URL guessing. Verified via full link-extraction across every HTML page — `members/choo-smith.html` is the only member profile not referenced by any `<a href>`.
- Choo's own profile page text says he "serves on the Membership Services Committee alongside Chairman Greg Foster and nine fellow committee members" — implying an 11-person committee (Greg + 9 + Choo), which matches neither "nine" nor "ten."

**Why I didn't just fix it:** restoring Choo's card is mechanically trivial (his profile page already has all the content needed — name, tags, bio paragraph, avatar initials "CS"), but doing so means picking a headline number (nine? ten? eleven?) across three pages, and roster composition is a fact about Greg's actual committee, not a bug I can infer from code. Getting this wrong either erases a real committee member from public view (current state) or invents a number that doesn't match reality.

**Recommendation:** confirm with Greg whether Choo Smith is an active 11th (or replacement) committee member, then either (a) restore his card to `members.html` and standardize "eleven" across `index.html`/`about.html`/`members.html`, or (b) if he's not current, decide whether the standalone profile page and directory row should also come down. Either way, someone published a full profile for him and then orphaned it — worth a quick "did we mean to do this" check with Greg regardless of the final number.

### 2. Bill — "host" vs "chatbot" (design recommendation, not a fix)

Mike's read that Bill feels like "a dumb, mute chatbot" doesn't match what's actually configured in `js/legends-guide-config.js` — the persona is rich: Bill has a two-stage greeting (name-first, then a role intro: *"I help run this site for Greg Foster and the team — I can show you around, answer questions, take bug reports or feature requests, and pass messages to Greg when he's not around"*), a team of named specialist hand-offs (Dana · Member Services for intake, Quinn · Review for changelog walkthroughs), a conversational shell, and telemetry logging every turn for review in `admin-bill-log.html`. The *backend persona* is not the problem.

**The gap is entirely in surfacing.** Across all 24 top-level pages, the "Ask Bill" entry point is a single plain-text nav link — `<li id="ask-bill-nav"><a href="...">Ask Bill</a></li>` — styled identically to "About & Contact" next to it. No avatar, no color, no motion, no hint that a person-like presence exists until the visitor already knows to click that exact five-letter label in a wall of nav text. Compare to the floating-FAB pattern described in `SOMA-GUIDE-README.md` (the widget engine supports a draggable/introduce-once FAB with `persona.avatar` — 🏀 — visible) — that FAB experience may not be rendering the way the doc describes on every page, or Mike's encountering the plain nav-link path specifically.

**Recommendations (ranked, for Mike/design, not executed):**
1. **Verify the floating FAB is actually rendering** on the pages Mike's been testing — if `window.somaGuide` mounts a bottom-right 🏀 button per SOMA-GUIDE-README.md's spec, that's a much stronger "host" signal than the nav text link, and if it's not appearing that's a real bug worth its own investigation (out of scope for this pass — didn't have a headless browser available to visually confirm; no `chrome-devtools` MCP or puppeteer installed in this environment, see Verification Notes).
2. **Give the nav link a face.** Even just prefixing the nav text with the 🏀 avatar (`🏀 Ask Bill` instead of `Ask Bill`) costs nothing and immediately reads as "a character," not a menu item.
3. **Proactive greeting on first visit**, not just on-click: the config already supports `persona.greeting` for first-contact — confirm it's actually firing unprompted (auto-open) on a fresh session per `SOMA-GUIDE-README.md`'s documented "First visit: widget opens automatically" behavior, rather than requiring the visitor to find and click Ask Bill at all.
4. **Say what he does, not just his name**, in the one line of chrome a visitor sees before engaging — e.g. nav label "Ask Bill (site guide)" or a one-word subtitle under the FAB — since "Bill" alone gives no affordance that he can take bug reports, walk you through pages, or reach Greg.

This is a design conversation, not code I should be making unilateral calls on — flagging with specifics so Mike can decide what "host, not widget" actually means for this audience (basketball alumni, many non-technical, many meeting Bill for the first time).

---

## Verification notes

- `npm test` (863 tests, node --test) — 860 pass / 0 fail / 3 skip, before and after edits.
- `node tools/verify-deploy.mjs` — all green (CDN engine match, Bill config match, knowledge pack match, feedback endpoint healthy, inference endpoint healthy).
- `node scripts/build-nav.mjs` — 0 pages regenerated (no unintended nav drift from edits).
- Manual `curl` sweep of all 25 top-level pages + spot checks of member profile pages — all 200.
- No headless browser / chrome-devtools MCP available in this environment to capture actual browser console errors or take screenshots — audit relied on static source inspection + `curl`/test-suite verification instead. If a true console-error sweep is wanted, re-run with Chrome MCP or Puppeteer available.
- Draft deploy: `netlify deploy --dir=.` (no `--prod` flag used) → live at the preview URL above; copyright fix and comment removal both confirmed present via curl against the draft URL.
- Git: single commit `6bc340b3` on `nightly/legends-improvements`, local only, not pushed, prefixed `fix(legends): `, co-authored per instructions. Worktree left in place at `/Users/mikewolf/Projects/.nightly-legends` for Mike's review before any merge/push decision.

## Files touched

- 29 `*.html` files (copyright year) + `index.html` (dev-comment removal) — all in `/Users/mikewolf/Projects/.nightly-legends/`
- No JS, CSS, auth config, Supabase config, or Bill persona config touched, per constraints.
