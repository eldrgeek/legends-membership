/**
 * resource-settings.js — Netlify Function for per-resource nav visibility.
 *
 * GET  → returns the current resource-visibility settings (public; falls back
 *        to DEFAULT_SETTINGS when the backend is not configured or the file
 *        does not exist yet).
 * POST → admin-only; validates the caller's Supabase auth token, confirms the
 *        admin role, then upserts the settings JSON into the private
 *        "site-config" Storage bucket.
 *
 * Uses the Supabase REST/Storage API directly via global fetch — matching the
 * no-SDK pattern of submit-assessment.js / submit-recommendation.js. Do NOT
 * add @supabase/supabase-js: it is not a top-level dependency and requiring it
 * fails Netlify's function bundling.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables. The
 * service-role key bypasses RLS — it must NEVER appear in client code or the repo.
 */

const ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
const BUCKET = 'site-config';
const SETTINGS_FILE = 'resource-visibility.json';
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co';

const DEFAULT_SETTINGS = {
  resources: { label: 'Resources', href: 'resources.html', visibility: 'committee-only' },
  minutes: { label: 'Minutes', href: 'minutes.html', visibility: 'committee-only' },
  'systems-map': { label: 'Systems Map', href: 'systems-map.html', visibility: 'committee-only' },
  assessment: { label: 'Assessment', href: 'assessment.html', visibility: 'committee-only' },
  'player-benefits': { label: 'Player Benefits', href: 'player-benefits.html', visibility: 'open' }
};

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svcKey) {
    return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
  }

  const svcHeaders = { apikey: svcKey, Authorization: `Bearer ${svcKey}` };
  const objectUrl = `${SUPABASE_URL}/storage/v1/object/${BUCKET}/${SETTINGS_FILE}`;

  // ── GET: return current settings (public) ──────────────────────────────────
  if (event.httpMethod === 'GET') {
    try {
      const res = await fetch(objectUrl, { headers: svcHeaders });
      if (!res.ok) return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
      const text = await res.text();
      return { statusCode: 200, headers, body: text };
    } catch (e) {
      return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
    }
  }

  // ── POST: admin-only update ────────────────────────────────────────────────
  if (event.httpMethod === 'POST') {
    const authHeader = (event.headers || {}).authorization || (event.headers || {}).Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

    // Validate the caller's token via the auth API.
    let user;
    try {
      const ures = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: svcKey, Authorization: `Bearer ${token}` }
      });
      if (!ures.ok) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
      user = await ures.json();
    } catch (e) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };
    }
    if (!user || !user.id) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };

    // Confirm admin role (via profiles table, or the static allowlist).
    let role = null;
    try {
      const pres = await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=role`,
        { headers: svcHeaders }
      );
      if (pres.ok) {
        const rows = await pres.json();
        role = rows && rows[0] && rows[0].role;
      }
    } catch (e) { /* fall through to allowlist */ }

    const admin = role === 'admin' || ADMIN_EMAILS.includes(user.email);
    if (!admin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };

    let newSettings;
    try {
      newSettings = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    for (const [key, val] of Object.entries(newSettings)) {
      if (!val || !['open', 'committee-only'].includes(val.visibility)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid visibility for ' + key }) };
      }
    }

    // Ensure the bucket exists (ignore "already exists" errors).
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...svcHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false })
      });
    } catch (e) { /* ignore */ }

    // Upsert the settings file.
    const payload = JSON.stringify(newSettings, null, 2);
    const upRes = await fetch(objectUrl, {
      method: 'POST',
      headers: { ...svcHeaders, 'Content-Type': 'application/json', 'x-upsert': 'true' },
      body: payload
    });

    if (!upRes.ok) {
      const errText = await upRes.text().catch(() => '');
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Save failed: ' + errText }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, settings: newSettings }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
