# legends-membership-site RECIPES

## Ask Bill is broken → diagnostic path

**Step 1 — Is soma-guide loading?**
```bash
curl -I https://soma-guide.netlify.app/soma-guide.js
```
- 404 → fix soma-platform CDN deploy (see soma-platform/RECIPES.md)
- 200 → continue

**Step 2 — Is el-proxy alive?**
```bash
curl "https://bill-talk.netlify.app/.netlify/functions/el-proxy?action=list&agent_id=agent_2401ks53q6t8e2drt1h7va3f2c52"
```
- JSON with conversations → key and proxy are fine
- error body → ElevenLabs key issue (see bill-talk/BREADCRUMBS.md)

**Step 3 — Is the ElevenLabs agent valid?**
Agent ID: `agent_2401ks53q6t8e2drt1h7va3f2c52`
If the agent was deleted or replaced in ElevenLabs dashboard, update it in:
  - `~/Projects/legends-membership-site/js/legends-guide-config.js` (voiceAgentId + TX_AGENT_ID)
  - `~/Projects/bill-talk/index.html` (AGENT_ID constant)

**Step 4 — Is text Q&A working?**
```bash
curl -X POST https://vpsmikewolf.duckdns.org/infer/ask \
  -H "Content-Type: application/json" \
  -d '{"question":"test","context":"test"}'
```
Error with "credit balance" → top up Anthropic credits on VPS account.

---

## Deploying site changes

Branch for current fix: `fix/ask-bill` in soma-platform.
The legends-membership-site itself deploys from its own repo (Netlify site: legends-membership.netlify.app).

```bash
# After changes are approved:
cd ~/Projects/soma-platform && git push origin fix/ask-bill
# Merge PR in GitHub → Netlify auto-deploys soma-guide.netlify.app

cd ~/Projects/legends-membership-site
# make changes on fix/ask-bill branch, then:
git push origin fix/ask-bill
# Netlify preview deploy; promote to main for production
```
