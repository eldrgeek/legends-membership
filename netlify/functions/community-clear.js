/**
 * community-clear.js — admin-only "clear this room" for community chat.
 *
 * Deletes every message in a given room. Mirrors the security model of
 * admin-users.js: the caller's Supabase JWT (Authorization: Bearer <token>)
 * is verified, and the caller must have profiles.role = 'admin' (or be a
 * bootstrap admin) before anything is deleted. Uses the service-role key so
 * the delete bypasses the per-user RLS delete policy.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in the Netlify environment. Without it
 * the function returns 503 and deletes nothing (safe to deploy un-keyed).
 *
 * POST JSON body: { room: "general" }
 */
'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co';
const BOOTSTRAP_ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function cleanRoom(value) {
  return String(value || 'general')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'general';
}

exports.handler = async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Use POST.' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return jsonResponse(503, { error: 'Clearing chat is not enabled (service-role key not configured).' });
  }

  // Authenticate caller.
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  if (!authHeader.startsWith('Bearer ')) return jsonResponse(401, { error: 'Sign in first.' });
  const callerJwt = authHeader.slice(7);

  let callerUser;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${callerJwt}`, apikey: SERVICE_KEY },
    });
    if (!res.ok) return jsonResponse(401, { error: 'Invalid or expired session.' });
    callerUser = await res.json();
  } catch (err) {
    return jsonResponse(500, { error: 'Failed to verify session.' });
  }

  // Confirm admin.
  let callerRole = null;
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${callerUser.id}&select=role&limit=1`,
      { headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY } }
    );
    const rows = await res.json();
    callerRole = rows && rows[0] && rows[0].role;
  } catch (err) {
    return jsonResponse(500, { error: 'Failed to verify caller role.' });
  }
  if (callerRole !== 'admin' && !BOOTSTRAP_ADMIN_EMAILS.includes((callerUser.email || '').toLowerCase())) {
    return jsonResponse(403, { error: 'Only admins can clear the chat.' });
  }

  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; }
  catch (e) { return jsonResponse(400, { error: 'Invalid JSON body.' }); }

  const room = cleanRoom(body.room);

  // Delete every message in the room (service-role bypasses RLS).
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/community_messages?room=eq.${encodeURIComponent(room)}`,
      {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          apikey: SERVICE_KEY,
          Prefer: 'return=representation',
        },
      }
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return jsonResponse(502, { error: 'Delete failed.', detail: text.slice(0, 300) });
    }
    const deleted = await res.json().catch(() => []);
    return jsonResponse(200, { ok: true, room, deleted: Array.isArray(deleted) ? deleted.length : null });
  } catch (err) {
    return jsonResponse(500, { error: 'Could not clear the room.' });
  }
};
