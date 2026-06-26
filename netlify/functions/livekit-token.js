'use strict';

const crypto = require('node:crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co';
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LIVEKIT_URL = process.env.LIVEKIT_URL || 'wss://vpsmikewolf.duckdns.org';
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || '';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || '';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return { statusCode, headers, body: JSON.stringify(body) };
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

exports.handler = async function handler(event) {
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

  let body = {};
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch (error) {
    return json(400, { error: 'Invalid JSON body.' });
  }

  const room = cleanRoomName(body.room);
  const now = Math.floor(Date.now() / 1000);
  const identity = user.email || user.id;
  const token = signJwt({
    iss: LIVEKIT_API_KEY,
    sub: identity,
    name: user.user_metadata && user.user_metadata.full_name ? user.user_metadata.full_name : identity,
    nbf: now - 10,
    exp: now + (60 * 60),
    video: {
      room,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    },
  }, LIVEKIT_API_SECRET);

  return json(200, { url: LIVEKIT_URL, token, room });
};
