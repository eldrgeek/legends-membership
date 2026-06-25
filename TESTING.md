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
`../soma-platform/packages/soma-guide/soma-guide.js` (sibling checkout) —
it is deliberately not vendored here.

## Layer 5 — Deploy drift (`npm run verify:deploy`)

The engine deploys **manually** to soma-guide.netlify.app; this site deploys
via git CD. `tools/verify-deploy.mjs` diffs every live surface against local
sources (engine js/css, config, knowledge pack) and probes the
submit-feedback function and the inference endpoint. Exit 1 on drift.
Run it after every engine change and after every push.

## Layer 6 — Supabase E2E (`npm run test:e2e`)

`tools/regression-test.mjs` — live-service checks (needs
`SUPABASE_SERVICE_ROLE_KEY`).
