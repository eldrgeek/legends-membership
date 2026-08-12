/**
 * update-feedback.js — Update status of a bill_feedback row (admin only).
 *
 * POST { id: uuid, status: 'greg-approved' | 'rejected' | 'dispatched' }
 * Requires: Authorization header with a valid admin JWT from SomaAuth.
 * Uses service-role key so RLS is bypassed server-side.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
/* Anon key is public — safe to embed. Service-role key stays in env. */
const SUPABASE_ANON_KEY = 'sb_publishable_vi2qDWjozUJ5mi9dwirkLA_rj6UaqLf'; // gitleaks:allow — publishable key class is public by design
const ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com', 'demo-admin@mike-wolf.com'];
const ALLOWED_STATUSES = ['new', 'greg-approved', 'rejected', 'dispatched', 'shipped'];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return jsonResponse(503, { error: 'Backend not configured' });

  /* Verify caller is an admin via their JWT */
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!token) return jsonResponse(401, { error: 'Authentication required' });

  /* Fetch the user from Supabase Auth to verify admin status */
  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!userRes.ok) return jsonResponse(401, { error: 'Invalid or expired session' });
  const userData = await userRes.json();
  const userEmail = userData && userData.email;
  if (!userEmail || !ADMIN_EMAILS.includes(userEmail.toLowerCase())) {
    return jsonResponse(403, { error: 'Admin access required' });
  }

  let body;
  try { body = JSON.parse(event.body || '{}'); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const { id, status } = body;
  if (!id || typeof id !== 'string') return jsonResponse(400, { error: 'id is required' });
  if (!status || !ALLOWED_STATUSES.includes(status)) {
    return jsonResponse(400, { error: 'status must be one of: ' + ALLOWED_STATUSES.join(', ') });
  }

  const res = await fetch(`${SUPABASE_URL}/rest/v1/bill_feedback?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('Supabase PATCH failed:', res.status, errText);
    return jsonResponse(500, { error: 'Failed to update feedback' });
  }

  return jsonResponse(200, { message: 'Status updated', id, status });
};
