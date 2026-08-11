# legends-membership-site BREADCRUMBS

## Live URL
https://legends-membership.netlify.app

## Ask Bill — dependency chain
```
legends-membership-site pages
  → <link>   /vendor/soma-guide/soma-guide.css              ← widget styles (VENDORED)
  → <script> js/legends-knowledge.js                        ← local knowledge pack
  → <script> js/legends-guide-config.js                     ← per-site Bill config
       ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy'
       voiceAgentId: 'agent_2401ks53q6t8e2drt1h7va3f2c52'
       inferenceUrl: 'https://vpsmikewolf.duckdns.org/infer/ask'  ← text Q&A
  → <script> js/legends-ask-bill-resilience.js              ← degradation layer
  → <script> /vendor/soma-guide/soma-guide.js               ← widget engine (VENDORED)
```

**The engine is vendored same-origin as of 2026-08-11.** It used to load from
`soma-guide.netlify.app`, a hand-deployed third-party host. That host was
returning 404 for its entire site while production still shipped the reference,
so `window.somaGuide` was undefined for every member and the in-page
"Ask Bill →" button did nothing. Nothing in the estate noticed. Ask Bill now
ships and rolls back with this repo. Provenance: `vendor/soma-guide/PROVENANCE.txt`.

## Ask Bill — what breaks what
| Symptom | Probable cause | Intended degradation |
|---------|---------------|----------------------|
| Widget never appears | `/vendor/soma-guide/soma-guide.js` failed to load (bad deploy) | resilience layer opens a same-origin text panel answering from local knowledge |
| Widget loads but TTS narration silent | bill-talk el-proxy down or ElevenLabs key expired | voice marked unavailable + explicit text-only notice; text keeps working |
| Voice chat fails to connect | ElevenLabs agent ID invalid, quota exceeded, or key expired | same as above |
| Text Q&A returns error | VPS inference down or Anthropic credits exhausted | answer served from `js/legends-knowledge.js` instead of a dead end |
| Everything above at once | total blackout | member still navigates, reads, submits requests, and gets local answers |

Every row is enforced by `npm run test:dependency-failures`. If you change the
chain, that matrix is the thing to keep green.

## Key files
- `vendor/soma-guide/` — VENDORED widget engine + styles (byte-identical copy of soma-platform; see PROVENANCE.txt)
- `js/legends-ask-bill-resilience.js` — degradation layer: fallback panel, local answers, voice-death notice
- `tests/dependency-failures.test.js` — the failure-path matrix (blocks each dependency individually)
- `js/legends-guide-config.js` — Bill persona, voiceAgentId, ttsProxyUrl, inferenceUrl, all walkthroughs
- `js/legends-knowledge.js` — knowledge pack fed to inference endpoint AND the offline fallback
- `js/soma-auth.js` + `js/soma-auth-config.js` — Supabase auth wrapper
- `css/style.css` — site styles
- `netlify.toml` — build config (no functions in this repo; el-proxy lives in bill-talk)

## External dependencies (Chesterton's fence)
1. ~~**soma-guide CDN** (soma-guide.netlify.app)~~ — **REMOVED 2026-08-11.** Engine vendored to
   `vendor/soma-guide/`. Do not re-point pages at that host; it 404s and its deploy is manual.
2. **bill-talk el-proxy** (bill-talk.netlify.app) — must have ELEVENLABS_API_KEY set. Optional: voice only.
3. **ElevenLabs agent** ID `agent_2401ks53q6t8e2drt1h7va3f2c52` — must be active. Optional: voice only.
4. **VPS infer/ask** (vpsmikewolf.duckdns.org) — needs Anthropic API credits. Optional: falls back to local knowledge.

Only #1 was ever load-bearing for the widget existing at all, and it is now gone.
2–4 are allowed to fail; the matrix proves what happens when they do.

## Auth — SOMA Auth (Supabase magic-link)
This repo is the **reference implementation** of the SOMA Auth standard.
See `~/Projects/SOMA/standards/SOMA-AUTH.md` for the architecture, drop-in recipe,
provisioning checklist, and copy-paste patterns for new SOMA apps.

Netlify Identity is **permanently removed** (2026-06-05). Not an option.
- `js/soma-auth.js` — IIFE runtime (copy verbatim to new projects)
- `js/soma-auth-config.js` — Supabase project url + anon key (public-safe)
- `login.html` — magic-link send UI + post-login redirect
- `admin.html` — admin-gated page example
- `minutes.html` — member-gated page example

## Recommendations page
Loads cards from `https://vpsmikewolf.duckdns.org/api/recommendations?app=legends`.
Filter buttons: All / Bugs / Features / Open / Triaged / Approved / Shipped / Rejected.
Each card links to `rec-detail.html?id=<id>`. Submit via `bugs.html` or `features.html`.
