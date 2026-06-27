---
district: soma-core
status: active
depends_on: [soma-platform]
capabilities: [supabase, auth, elevenlabs, netlify]
last_reviewed: 2026-06-23
---

# legends-membership-site — client membership platform with an embedded SOMA guide (Bill, voice + text via ElevenLabs) and a change-management queue

**Where work happens:** static HTML pages at root (`index.html`, `members.html`, `admin.html`, `admin-changelog.html`) · `js/legends-guide-config.js` (Bill persona/walkthroughs) · `js/legends-knowledge.js` (KB fed to inference) · `js/soma-auth.js` + `js/soma-auth-config.js` (Supabase auth) · `netlify/functions/` (intake, feedback, recommendations, `log-bill.js`)

**Key docs** (read in this order):
- [BREADCRUMBS.md](BREADCRUMBS.md) — Ask-Bill dependency chain + "what breaks what" table; read first
- [SOMA-GUIDE-README.md](SOMA-GUIDE-README.md) — guide widget integration + config object shape
- [AUTH-SETUP.md](AUTH-SETUP.md) — SOMA Auth (Supabase magic-link); this repo is the reference impl
- BILL-HANDOFF (full handoff): `~/Projects/soma-platform/docs/BILL-HANDOFF.md`

**Skills**
- global: `repo-docs`, `second-brain-builder`
- gap: change-management queue/daemon operating procedure (Bill log → changelog → review) should become a local skill

**Depends on / used by:** loads the guide widget engine + styles from **soma-platform** (soma-guide.netlify.app CDN); TTS via **bill-talk** el-proxy; text Q&A via **VPS infer/ask**; auth via **Supabase**. Deployed on **Netlify** (legends-membership.netlify.app).

**Gotchas**
- Ask-Bill is a 4-link external chain (soma-guide CDN, bill-talk el-proxy, ElevenLabs agent `agent_2401ks53q6t8e2drt1h7va3f2c52`, VPS infer/ask) — any one down breaks the widget. See BREADCRUMBS "what breaks what".
- Netlify Identity is **permanently removed** (2026-06-05) — use SOMA Auth only, never re-add it.
- el-proxy and the recommendations/inference API live **elsewhere** (bill-talk, VPS), not in this repo; only intake/feedback functions are local.
