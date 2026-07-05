// ─────────────────────────────────────────────────────────────────────────────
// POST /.netlify/functions/feedback
//
// soma-feedback widget backend (SOMA-APP-STANDARD.md §8). Ported logic-for-logic
// from the canonical reference (playmaker/netlify/functions/feedback.ts). Files
// a SOMA board card by emailing [BOARD] <title> from claude@mike-wolf.com to
// itself — claude-email-daemon (~/Projects/claude-email-daemon/daemon.py,
// handle_board_email) already polls that inbox, already trusts that sender, and
// already writes ~/Projects/SOMA/board/inbox/*.md. No new service, no new
// allowlist entry, no client-side secret: SMTP creds live ONLY in Netlify env
// (CLAUDE_EMAIL_ADDRESS / CLAUDE_EMAIL_PW), never shipped to the browser.
//
// This is deliberately SEPARATE from submit-feedback.js (the authed,
// Supabase-backed "report a bug / suggest a feature" path). soma-feedback is the
// SOMA-standard under-construction affordance: anonymous, no login required, raw
// ask straight to the board. The two coexist per §8.
//
// Body: { site, page, url, area, text, name, email, submitBuild, elementHint, hp }
// Returns: { ok: true, filedAt }
// ─────────────────────────────────────────────────────────────────────────────

const { sendMail } = require('./lib/smtp-send');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

const MAX_TEXT = 4000;
const MAX_FIELD = 200;

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const user = process.env.CLAUDE_EMAIL_ADDRESS;
  const pass = process.env.CLAUDE_EMAIL_PW;
  if (!user || !pass) {
    return {
      statusCode: 503,
      headers: CORS,
      body: JSON.stringify({ error: 'Feedback intake not configured (missing CLAUDE_EMAIL_ADDRESS/CLAUDE_EMAIL_PW).' }),
    };
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch (_) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'invalid JSON' }) };
  }

  // Honeypot: any non-empty value means a bot filled every field. Return a
  // success-shaped response so the bot learns nothing — silently drop it.
  if (typeof body.hp === 'string' && body.hp.trim().length > 0) {
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };
  }

  const text = String(body.text || '').trim().slice(0, MAX_TEXT);
  if (!text) {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'text is required' }) };
  }

  const site = String(body.site || 'unknown-site').trim().slice(0, MAX_FIELD);
  const page = String(body.page || '').trim().slice(0, MAX_FIELD);
  const url = String(body.url || '').trim().slice(0, 500);
  const area = String(body.area || '').trim().slice(0, MAX_FIELD);
  const name = String(body.name || 'anonymous').trim().slice(0, MAX_FIELD);
  const email = String(body.email || '').trim().slice(0, MAX_FIELD);
  const submitBuild = body.submitBuild === true;
  const elementHint = String(body.elementHint || '').trim().slice(0, 300);
  const filedAt = new Date().toISOString();

  const titleBase = text.slice(0, 60).replace(/\s+/g, ' ').trim();
  const subject = `[BOARD] ${site} feedback: ${titleBase}`;

  // Structured meta block the daemon lifts into real frontmatter (see
  // claude-email-daemon/daemon.py handle_board_email — SOMA-CARD-META support).
  const metaLines = [
    '<!--SOMA-CARD-META',
    `needs-mike: ${submitBuild ? 'false' : 'true'}`,
    `auto-dispatch: ${submitBuild ? 'true' : 'false'}`,
    'tags: [outer-loop, soma-feedback]',
    `app: ${site}`,
    `page: ${page || url}`,
    area ? `area: ${area}` : null,
    `reporter-name: ${name}`,
    `reporter-email: ${email || 'not-provided'}`,
    'SOMA-CARD-META-->',
  ].filter((l) => l !== null).join('\n');

  const bodyLines = [
    metaLines,
    '',
    `# ${site} — feedback from ${name}`,
    '',
    `**Page:** ${url || page || '(not captured)'}`,
    area ? `**Location:** ${area}` : null,
    elementHint ? `**Element context:** ${elementHint}` : null,
    `**Reporter:** ${name}${email ? ` <${email}>` : ''}`,
    `**Mode:** ${submitBuild ? 'Submit & Build (auto-dispatch requested)' : 'Submit (review only)'}`,
    '',
    '## Verbatim ask',
    '',
    text,
    '',
    submitBuild
      ? '_Filed via soma-feedback widget — Submit & Build. Treat as admin-tier RSI outer-loop item per SOMA/specs/rsi-loops-v1.md: straight to development unless triage says otherwise._'
      : '_Filed via soma-feedback widget — Submit. Stage for review._',
  ].filter((l) => l !== null);

  try {
    await sendMail({
      host: 'smtp.gmail.com',
      port: 587,
      user,
      pass,
      from: user,
      to: user, // self-send: claude@mike-wolf.com is already allowlisted for [BOARD]
      subject,
      text: bodyLines.join('\n'),
    });
  } catch (err) {
    console.error('soma-feedback SMTP send failed:', err && err.message);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({ error: 'Could not file feedback right now. Try again shortly.' }),
    };
  }

  return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true, filedAt }) };
};
