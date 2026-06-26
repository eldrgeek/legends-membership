'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const AUTH_CONFIG = fs.readFileSync(path.join(ROOT, 'js/soma-auth-config.js'), 'utf8');
const SUPABASE_URL = (AUTH_CONFIG.match(/url:\s*'([^']+)'/) || [])[1];
const SUPABASE_ANON_KEY = (AUTH_CONFIG.match(/anonKey:\s*'([^']+)'/) || [])[1];
const SITE_URL = process.env.LEGENDS_SITE_URL || 'https://legends-membership.netlify.app';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error('Could not read Supabase auth config.');
}

if (!SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for production smoke tests.');
}

function randomEmail() {
  return `legends-smoke-${Date.now()}-${crypto.randomBytes(3).toString('hex')}@example.test`;
}

async function supabaseFetch(pathname, options = {}, serviceRole = false) {
  const response = await fetch(`${SUPABASE_URL}${pathname}`, {
    ...options,
    headers: {
      apikey: serviceRole ? SERVICE_ROLE_KEY : SUPABASE_ANON_KEY,
      Authorization: `Bearer ${serviceRole ? SERVICE_ROLE_KEY : SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new Error(`${pathname} failed: ${response.status} ${body && body.message ? body.message : text}`);
  }
  return body;
}

async function createUser(email, password) {
  return supabaseFetch('/auth/v1/admin/users', {
    method: 'POST',
    body: JSON.stringify({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Legends Smoke Test' },
    }),
  }, true);
}

async function deleteUser(id) {
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${id}`, {
    method: 'DELETE',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
  });
}

async function signIn(email, password) {
  return supabaseFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

async function insertChat(session, body) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/community_messages`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      user_id: session.user.id,
      user_email: session.user.email,
      room: 'smoke',
      body,
    }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`chat insert failed: ${response.status} ${text}`);
  return JSON.parse(text)[0];
}

async function getLiveKitToken(session) {
  const response = await fetch(`${SITE_URL}/.netlify/functions/livekit-token`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ room: 'legends-smoke' }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`livekit-token failed: ${response.status} ${body.error || ''}`);
  return body;
}

function connectSignal(url, token) {
  return new Promise((resolve, reject) => {
    const wsUrl = `${url.replace(/^http/, 'ws')}/rtc?access_token=${encodeURIComponent(token)}&auto_subscribe=1&sdk=js&version=smoke&protocol=16`;
    const socket = new WebSocket(wsUrl);
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('LiveKit signal connection timed out.'));
    }, 8000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      socket.close();
      resolve();
    });
    socket.addEventListener('error', (event) => {
      clearTimeout(timer);
      reject(event.error || new Error('LiveKit signal connection failed.'));
    });
  });
}

(async function main() {
  const email = randomEmail();
  const password = crypto.randomBytes(18).toString('base64url');
  let user = null;
  try {
    user = await createUser(email, password);
    const session = await signIn(email, password);
    const message = await insertChat(session, 'production smoke test');
    const livekit = await getLiveKitToken(session);
    const secondLivekit = await getLiveKitToken(session);
    if (livekit.identity && secondLivekit.identity && livekit.identity === secondLivekit.identity) {
      throw new Error('LiveKit returned the same participant identity for two joins from one signed-in user.');
    }
    await Promise.all([
      connectSignal(livekit.url, livekit.token),
      connectSignal(secondLivekit.url, secondLivekit.token),
    ]);
    console.log(JSON.stringify({
      ok: true,
      user: session.user.email,
      chatMessageId: message.id,
      livekitRoom: livekit.room,
      twoParticipantIdentities: Boolean(livekit.identity && secondLivekit.identity && livekit.identity !== secondLivekit.identity),
    }, null, 2));
  } finally {
    if (user && user.id) await deleteUser(user.id).catch(() => {});
  }
})().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
