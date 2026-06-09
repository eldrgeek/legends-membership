/**
 * submit-recommendation.js — Netlify Function for Legends "Share an Idea" submissions.
 *
 * Accepts a JSON POST from the resources.html "Share an Idea" form (and the
 * AI portal tool), applies basic validation, then inserts the row into
 * public.idea_submissions using the service-role key (bypasses RLS).
 *
 * Mirrors the proven pattern from submit-assessment.js.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.
 * If absent, returns 503 — deploying without the key is safe (stub state).
 *
 * To enable:
 *   1. Apply the idea_submissions table SQL in the Supabase SQL editor:
 *      https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl/sql/new
 *
 *      CREATE TABLE IF NOT EXISTS public.idea_submissions (
 *        id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *        name          text,
 *        email         text,
 *        idea          text NOT NULL,
 *        source        text DEFAULT 'web',
 *        ip            text,
 *        user_agent    text,
 *        created_at    timestamptz NOT NULL DEFAULT now()
 *      );
 *      ALTER TABLE public.idea_submissions ENABLE ROW LEVEL SECURITY;
 *      -- No public select/insert — all access via service-role function only.
 *
 *   2. SUPABASE_SERVICE_ROLE_KEY must already be set in Netlify env (it is).
 *   3. Trigger a redeploy so the new function is live.
 *
 * The service-role key bypasses RLS — it must NEVER appear in client-side code
 * or the repository.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const MAX_BODY_BYTES = 16384;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

function str(val, max) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s.slice(0, max || 2000) : null;
}

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // ── Service-role key guard ───────────────────────────────────────────────
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return jsonResponse(503, {
      error: 'submission backend not configured',
      message: 'Idea submissions are not yet enabled. Set SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables and redeploy.',
    });
  }

  // ── Size guard ───────────────────────────────────────────────────────────
  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Request too large' });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // ── Honeypot check ───────────────────────────────────────────────────────
  if (body.website && String(body.website).trim() !== '') {
    return jsonResponse(200, { message: 'Received' });
  }

  // ── Required fields ──────────────────────────────────────────────────────
  const idea = str(body.idea, 5000);
  if (!idea) {
    return jsonResponse(400, { error: 'idea is required' });
  }

  // ── Build insert row ─────────────────────────────────────────────────────
  const row = {
    name:       str(body.name, 120),
    email:      str(body.email, 255),
    idea,
    source:     'web',
    ip:         str(event.headers['x-forwarded-for'] || event.headers['client-ip'] || null, 100),
    user_agent: str(event.headers['user-agent'] || null, 500),
  };

  // ── Insert into Supabase ─────────────────────────────────────────────────
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/idea_submissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase insert failed:', res.status, errText);
      return jsonResponse(500, { error: 'Failed to record submission' });
    }

    return jsonResponse(200, { message: 'Idea submitted successfully — thank you!' });
  } catch (err) {
    console.error('Insert error:', err);
    return jsonResponse(500, { error: 'Failed to record submission' });
  }
};
