# legends-membership-site BREADCRUMBS

## Live URL
https://legends-membership.netlify.app

## Ask Bill — dependency chain
```
legends-membership-site pages
  → <script> https://soma-guide.netlify.app/soma-guide.js   ← widget engine CDN
  → <script> js/legends-guide-config.js                     ← per-site Bill config
       ttsProxyUrl: 'https://bill-talk.netlify.app/.netlify/functions/el-proxy'
       voiceAgentId: 'agent_2401ks53q6t8e2drt1h7va3f2c52'
       inferenceUrl: 'https://vpsmikewolf.duckdns.org/infer/ask'  ← text Q&A
  → <link> https://soma-guide.netlify.app/soma-guide.css    ← widget styles
```

## Ask Bill — what breaks what
| Symptom | Probable cause |
|---------|---------------|
| Ask Bill link in nav does nothing / widget never appears | soma-guide.netlify.app CDN 404 (soma-platform deploy broken) |
| Widget loads but TTS narration silent during tour | bill-talk el-proxy down or ElevenLabs key expired |
| Voice chat fails to connect | ElevenLabs agent ID invalid, quota exceeded, or key expired |
| "Ask Bill" text Q&A returns error | VPS inference endpoint down or Anthropic API credits exhausted |

## Key files
- `js/legends-guide-config.js` — Bill persona, voiceAgentId, ttsProxyUrl, inferenceUrl, all walkthroughs
- `js/legends-knowledge.js` — knowledge pack fed to inference endpoint
- `js/soma-auth.js` + `js/soma-auth-config.js` — Supabase auth wrapper
- `css/style.css` — site styles
- `netlify.toml` — build config (no functions in this repo; el-proxy lives in bill-talk)

## External dependencies (Chesterton's fence)
1. **soma-guide CDN** (soma-guide.netlify.app) — must be deployed from soma-platform/dist/
2. **bill-talk el-proxy** (bill-talk.netlify.app) — must have ELEVENLABS_API_KEY set
3. **ElevenLabs agent** ID `agent_2401ks53q6t8e2drt1h7va3f2c52` — must be active
4. **VPS infer/ask** (vpsmikewolf.duckdns.org) — needs Anthropic API credits

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
