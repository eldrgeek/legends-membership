'use strict';

// Hardened per SCC Convening III (2026-08-12, Locke C1): authentication is not
// authorization on the shared Supabase project (open signup), so a valid session
// alone must never mint a room token. Requires migrations/community_members.sql.

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://vpsmikewolf.duckdns.org';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

// Every LiveKit room minted by this function belongs to the Legends community.
const COMMUNITY_ID = 'legends';
const TOKEN_TTL_SECONDS = 15 * 60;

const ALLOWED_ORIGINS = [
  'https://legends-membership.netlify.app',
  'http://localhost:8888',
];
// Netlify deploy previews: https://<something>--legends-membership.netlify.app
const PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+--legends-membership\.netlify\.app$/;

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) || PREVIEW_ORIGIN.test(origin || '');
  const headers = {
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
    Vary: 'Origin',
  };
  if (allowed) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function base64url(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function signJwt(payload, secret) {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = base64url(JSON.stringify(payload));
  const input = `${header}.${claims}`;
  const signature = crypto.createHmac('sha256', secret).update(input).digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${input}.${signature}`;
}

function cleanRoomName(value) {
  return String(value || 'legends-community')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'legends-community';
}

function cleanConnectionId(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function getUser(accessToken) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

// Membership lookup with the service key — RLS-independent ground truth.
// Returns { role, display_name } or null if the user is not a member.
async function getMembership(userId) {
  const url = `${SUPABASE_URL}/rest/v1/community_members`
    + `?community_id=eq.${COMMUNITY_ID}&user_id=eq.${encodeURIComponent(userId)}`
    + '&select=role,display_name&limit=1';
  const response = await fetch(url, {
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
  if (!response.ok) return null;
  const rows = await response.json().catch(() => []);
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

exports.handler = async function handler(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const headers = corsHeaders(origin);
  const json = (statusCode, body) => ({ statusCode, headers, body: JSON.stringify(body) });

  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers, body: '' };
  if (event.httpMethod !== 'POST') return json(405, { error: 'Use POST.' });

  if (!SERVICE_ROLE_KEY) return json(503, { error: 'Supabase service role key is not configured.' });
  if (!LIVEKIT_API_KEY || !LIVEKIT_API_SECRET || !LIVEKIT_URL) {
    return json(503, { error: 'LiveKit credentials are not configured.' });
  }

  const auth = event.headers.authorization || event.headers.Authorization || '';
  const accessToken = auth.replace(/^Bearer\s+/i, '').trim();
  if (!accessToken) return json(401, { error: 'Sign in before joining video.' });

  const user = await getUser(accessToken).catch(() => null);
  if (!user || !user.id) return json(401, { error: 'Your session could not be verified.' });

  const membership = await getMembership(user.id).catch(() => null);
  if (!membership) {
    return json(403, { error: 'Video rooms are for Legends community members. Ask an admin to add you.' });
  }

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const room = cleanRoomName(body.room);
  const connectionId = cleanConnectionId(body.connectionId) || crypto.randomBytes(9).toString('base64url').toLowerCase();
  const now = Math.floor(Date.now() / 1000);
  // Display name only — never the email (it broadcast to every room participant).
  const displayName = membership.display_name
    || (user.user_metadata && user.user_metadata.full_name)
    || 'Legends member';
  const canPublish = membership.role !== 'viewer';
  const identity = `${user.id}-${connectionId}`;
  const token = signJwt({
    iss: LIVEKIT_API_KEY,
    sub: identity,
    name: displayName,
    metadata: JSON.stringify({ userId: user.id, role: membership.role, connectionId }),
    nbf: now - 10,
    exp: now + TOKEN_TTL_SECONDS,
    video: {
      room,
      roomJoin: true,
      canPublish,
      canSubscribe: true,
      canPublishData: canPublish,
    },
  }, LIVEKIT_API_SECRET);

  return json(200, { url: LIVEKIT_URL, token, room, identity, name: displayName });
};
