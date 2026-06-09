/**
 * admin-users.js — Netlify Function for Legends of Basketball admin actions.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.
 * If that variable is absent, every request returns 503 — deploying without
 * the key is safe and harmless.
 *
 * To enable this function:
 *   1. Get the service_role key from:
 *      https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl/settings/api
 *      (Project Settings → API → service_role — KEEP SECRET)
 *   2. Add it in Netlify:
 *      Site → Site settings → Environment variables → New variable
 *      Key: SUPABASE_SERVICE_ROLE_KEY   Value: <paste key here>
 *   3. Trigger a new deploy (or redeploy) so the variable takes effect.
 *
 * Actions (POST JSON body):
 *   { action: "invite", email: "user@example.com" }
 *     → invites a new user via Supabase auth.admin.inviteUserByEmail
 *   { action: "list" }
 *     → returns all auth users (id, email, created_at, last_sign_in_at)
 *   { action: "setrole", userId: "<uuid>", role: "admin"|"member" }
 *     → updates the profiles.role column for a user (server-side override)
 *
 * Security: every request must carry the caller's Supabase JWT in the
 * Authorization: Bearer <token> header. The function verifies the JWT with
 * the service-role client and confirms the caller has role='admin' in the
 * profiles table before executing any action.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    },
    body: JSON.stringify(body),
  };
}

exports.handler = async function (event) {
  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // ── Guard: service-role key must be present ──────────────────────────────
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return jsonResponse(503, {
      error: 'service-role key not configured',
      message: 'Invite and advanced admin actions are not yet enabled. To enable: set SUPABASE_SERVICE_ROLE_KEY in Netlify → Site settings → Environment variables, then redeploy.',
    });
  }

  // ── Authenticate the caller ───────────────────────────────────────────────
  const authHeader = event.headers['authorization'] || event.headers['Authorization'] || '';
  if (!authHeader.startsWith('Bearer ')) {
    return jsonResponse(401, { error: 'Missing or invalid Authorization header' });
  }
  const callerJwt = authHeader.slice(7);

  // Verify JWT and retrieve caller's user object
  let callerUser;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: {
        Authorization: `Bearer ${callerJwt}`,
        apikey: SERVICE_KEY,
      },
    });
    if (!res.ok) return jsonResponse(401, { error: 'Invalid or expired session' });
    callerUser = await res.json();
  } catch (err) {
    return jsonResponse(500, { error: 'Failed to verify session' });
  }

  // Check caller's role in profiles table (using service-role to bypass RLS)
  let callerRole;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerUser.id}&select=role&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
      }
    );
    const rows = await res.json();
    callerRole = rows && rows[0] && rows[0].role;
  } catch (err) {
    return jsonResponse(500, { error: 'Failed to verify caller role' });
  }

  const BOOTSTRAP_ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
  if (callerRole !== 'admin' && !BOOTSTRAP_ADMIN_EMAILS.includes((callerUser.email || '').toLowerCase())) {
    return jsonResponse(403, { error: 'Caller is not an admin' });
  }

  // ── Parse request body ────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON body' });
  }

  const { action } = body;

  // ── Action: list auth users ───────────────────────────────────────────────
  if (action === 'list') {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/users?per_page=500`, {
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
        },
      });
      const data = await res.json();
      // Return a trimmed set of fields
      const users = (data.users || []).map(u => ({
        id: u.id,
        email: u.email,
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at,
        confirmed_at: u.confirmed_at,
      }));
      return jsonResponse(200, { users });
    } catch (err) {
      return jsonResponse(500, { error: 'Failed to list users' });
    }
  }

  // ── Action: invite a user ─────────────────────────────────────────────────
  if (action === 'invite') {
    const { email } = body;
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return jsonResponse(400, { error: 'Valid email is required' });
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/invite`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return jsonResponse(res.status, { error: data.msg || data.message || 'Invite failed' });
      return jsonResponse(200, { message: `Invite sent to ${email}`, user: { id: data.id, email: data.email } });
    } catch (err) {
      return jsonResponse(500, { error: 'Failed to send invite' });
    }
  }

  // ── Action: set role (server-side, bypasses RLS) ──────────────────────────
  if (action === 'setrole') {
    const { userId, role } = body;
    if (!userId || !role) return jsonResponse(400, { error: 'userId and role are required' });
    if (!['admin', 'member'].includes(role)) return jsonResponse(400, { error: 'role must be "admin" or "member"' });
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal',
        },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        const err = await res.text();
        return jsonResponse(res.status, { error: err });
      }
      return jsonResponse(200, { message: `Role updated to ${role} for user ${userId}` });
    } catch (err) {
      return jsonResponse(500, { error: 'Failed to update role' });
    }
  }

  return jsonResponse(400, { error: `Unknown action: ${action}` });
};
