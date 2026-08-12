#!/usr/bin/env node
// Three-account executable verification gate — SCC Convening III §3f (2026-08-12).
//
// Proves, against the LIVE project, that:
//   ANONYMOUS        cannot read community messages / rooms, cannot mint a video token
//   SIGNED-IN NON-MEMBER (throwaway account, open signup) reads ZERO rows, cannot
//                    post, gets 403 from livekit-token
//   MEMBER           reads messages + rooms, can post, gets a LiveKit token with
//                    no email in it, canPublish per role, TTL <= 15 min
//
// A Supabase RLS refusal on select returns 200/204 with zero rows and does NOT
// throw (see memory: reference_supabase_js_silent_rls_refusal) — so every check
// below inspects status + body explicitly instead of relying on exceptions.
//
// Requires: SUPABASE_SERVICE_ROLE_KEY in env (admin create/delete of the two
// throwaway test users; never printed). Optional: SITE_URL (defaults to prod).
//
// Usage: SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-rls-gate.mjs

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SITE_URL = process.env.SITE_URL || 'https://legends-membership.netlify.app';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const cfg = readFileSync(join(ROOT, 'js', 'soma-auth-config.js'), 'utf8');
const SUPABASE_URL = (cfg.match(/url:\s*'([^']+)'/) || [])[1];
const ANON_KEY = (cfg.match(/anonKey:\s*'([^']+)'/) || [])[1];

if (!SUPABASE_URL || !ANON_KEY) { console.error('FATAL: could not parse js/soma-auth-config.js'); process.exit(2); }
if (!SERVICE_KEY) { console.error('FATAL: SUPABASE_SERVICE_ROLE_KEY not in env'); process.exit(2); }

let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  — ' + detail}`);
  if (!ok) failures += 1;
}

async function rest(path, { key, jwt, method = 'GET', body, headers = {} } = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${jwt || key}`,
      'Content-Type': 'application/json',
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* 204s have no body */ }
  return { status: res.status, json };
}

async function livekitToken(jwt) {
  const res = await fetch(`${SITE_URL}/.netlify/functions/livekit-token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: SITE_URL,
      ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
    },
    body: JSON.stringify({ room: 'legends-community' }),
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

function decodeJwtPayload(token) {
  const part = token.split('.')[1];
  return JSON.parse(Buffer.from(part.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
}

const STAMP = Date.now();
const pw = () => 'Vrfy-' + Math.random().toString(36).slice(2) + '-' + Math.random().toString(36).slice(2);
const createdUserIds = [];
let createdMessageId = null;

async function adminCreateUser(email, password) {
  const { status, json } = await rest('/auth/v1/admin/users', {
    key: SERVICE_KEY, method: 'POST',
    body: { email, password, email_confirm: true },
  });
  if (status >= 300 || !json || !json.id) throw new Error(`admin create ${email}: HTTP ${status} ${JSON.stringify(json)}`);
  createdUserIds.push(json.id);
  return json.id;
}

async function signIn(email, password) {
  const { status, json } = await rest('/auth/v1/token?grant_type=password', {
    key: ANON_KEY, method: 'POST', body: { email, password },
  });
  if (status >= 300 || !json || !json.access_token) throw new Error(`sign-in ${email}: HTTP ${status}`);
  return json.access_token;
}

async function cleanup() {
  if (createdMessageId) {
    await rest(`/rest/v1/community_messages?id=eq.${createdMessageId}`, { key: SERVICE_KEY, method: 'DELETE' });
  }
  for (const id of createdUserIds) {
    const { status } = await rest(`/auth/v1/admin/users/${id}`, { key: SERVICE_KEY, method: 'DELETE' });
    if (status >= 300) console.error(`WARN: could not delete test user ${id} (HTTP ${status}) — delete manually`);
  }
}

try {
  console.log(`# verify-rls-gate against ${SUPABASE_URL} + ${SITE_URL}\n`);

  // ── 1. ANONYMOUS ──────────────────────────────────────────────────────────
  {
    const msgs = await rest('/rest/v1/community_messages?select=id&limit=10', { key: ANON_KEY });
    check('anon: community_messages returns zero rows',
      msgs.status < 300 && Array.isArray(msgs.json) && msgs.json.length === 0,
      `HTTP ${msgs.status}, ${Array.isArray(msgs.json) ? msgs.json.length + ' rows' : JSON.stringify(msgs.json)}`);

    const rooms = await rest('/rest/v1/chat_rooms?select=id&limit=10', { key: ANON_KEY });
    check('anon: chat_rooms returns zero rows',
      rooms.status < 300 && Array.isArray(rooms.json) && rooms.json.length === 0,
      `HTTP ${rooms.status}, ${Array.isArray(rooms.json) ? rooms.json.length + ' rows' : JSON.stringify(rooms.json)}`);

    const members = await rest('/rest/v1/community_members?select=user_id&limit=10', { key: ANON_KEY });
    check('anon: community_members returns zero rows',
      members.status < 300 && Array.isArray(members.json) && members.json.length === 0,
      `HTTP ${members.status}, ${Array.isArray(members.json) ? members.json.length + ' rows' : JSON.stringify(members.json)}`);

    const lk = await livekitToken(null);
    check('anon: livekit-token refuses (401)', lk.status === 401, `HTTP ${lk.status} ${JSON.stringify(lk.json)}`);
  }

  // ── 2. SIGNED-IN NON-MEMBER (the throwaway-stranger test) ─────────────────
  {
    const email = `rls-verify-nonmember-${STAMP}@mike-wolf.com`;
    const password = pw();
    // Prefer the genuine open-signup door; fall back to admin-create if email
    // confirmation blocks the session.
    let jwt = null;
    const signup = await rest('/auth/v1/signup', { key: ANON_KEY, method: 'POST', body: { email, password } });
    const signupUserId = signup.json && ((signup.json.user && signup.json.user.id) || signup.json.id);
    if (signup.status < 300 && signup.json && signup.json.access_token) {
      jwt = signup.json.access_token;
      if (signupUserId) createdUserIds.push(signupUserId);
      console.log('  (non-member created via PUBLIC open signup — stranger door confirmed open)');
    } else if (signup.status < 300 && signupUserId) {
      // Open signup created the account but requires email confirmation for a
      // session. The door is still open — any inbox can click the link. Confirm
      // via admin (simulating that click) and sign in.
      createdUserIds.push(signupUserId);
      const confirm = await rest(`/auth/v1/admin/users/${signupUserId}`, {
        key: SERVICE_KEY, method: 'PUT', body: { email_confirm: true },
      });
      if (confirm.status >= 300) throw new Error(`could not confirm signup user: HTTP ${confirm.status}`);
      jwt = await signIn(email, password);
      console.log('  (non-member created via PUBLIC open signup; email-confirm simulated via admin — stranger door confirmed open)');
    } else {
      await adminCreateUser(email, password);
      jwt = await signIn(email, password);
      console.log(`  (public signup refused — HTTP ${signup.status}; non-member admin-created instead)`);
    }

    const msgs = await rest('/rest/v1/community_messages?select=id,user_email&limit=10', { key: ANON_KEY, jwt });
    check('non-member: community_messages returns zero rows (roster dump closed)',
      msgs.status < 300 && Array.isArray(msgs.json) && msgs.json.length === 0,
      `HTTP ${msgs.status}, ${Array.isArray(msgs.json) ? msgs.json.length + ' rows' : JSON.stringify(msgs.json)}`);

    const rooms = await rest('/rest/v1/chat_rooms?select=id&limit=10', { key: ANON_KEY, jwt });
    check('non-member: chat_rooms returns zero rows',
      rooms.status < 300 && Array.isArray(rooms.json) && rooms.json.length === 0,
      `HTTP ${rooms.status}, ${Array.isArray(rooms.json) ? rooms.json.length + ' rows' : JSON.stringify(rooms.json)}`);

    const me = decodeJwtPayload(jwt);
    const post = await rest('/rest/v1/community_messages', {
      key: ANON_KEY, jwt, method: 'POST',
      body: { user_id: me.sub, user_email: email, room: 'general', body: 'rls-verify: should be refused' },
      headers: { Prefer: 'return=representation' },
    });
    check('non-member: posting a message is refused (RLS error, not silent success)',
      post.status >= 400,
      `HTTP ${post.status} ${JSON.stringify(post.json)}`);

    const lk = await livekitToken(jwt);
    check('non-member: livekit-token refuses with 403', lk.status === 403, `HTTP ${lk.status} ${JSON.stringify(lk.json)}`);
  }

  // ── 3. MEMBER ─────────────────────────────────────────────────────────────
  {
    const email = `rls-verify-member-${STAMP}@mike-wolf.com`;
    const password = pw();
    const userId = await adminCreateUser(email, password);
    const enroll = await rest('/rest/v1/community_members', {
      key: SERVICE_KEY, method: 'POST',
      body: { community_id: 'legends', user_id: userId, display_name: 'RLS Verify Member', role: 'member' },
    });
    if (enroll.status >= 300) throw new Error(`could not enroll test member: HTTP ${enroll.status} ${JSON.stringify(enroll.json)}`);
    const jwt = await signIn(email, password);

    const msgs = await rest('/rest/v1/community_messages?select=id&limit=10', { key: ANON_KEY, jwt });
    check('member: can read community_messages (>0 rows)',
      msgs.status < 300 && Array.isArray(msgs.json) && msgs.json.length > 0,
      `HTTP ${msgs.status}, ${Array.isArray(msgs.json) ? msgs.json.length + ' rows' : JSON.stringify(msgs.json)}`);

    const rooms = await rest('/rest/v1/chat_rooms?select=id&limit=10', { key: ANON_KEY, jwt });
    check('member: can read chat_rooms (>0 rows)',
      rooms.status < 300 && Array.isArray(rooms.json) && rooms.json.length > 0,
      `HTTP ${rooms.status}, ${Array.isArray(rooms.json) ? rooms.json.length + ' rows' : JSON.stringify(rooms.json)}`);

    const post = await rest('/rest/v1/community_messages', {
      key: ANON_KEY, jwt, method: 'POST',
      body: { user_id: userId, user_email: email, room: 'general', body: 'rls-verify: member post (auto-deleted)' },
      headers: { Prefer: 'return=representation' },
    });
    const posted = post.status < 300 && Array.isArray(post.json) && post.json[0] && post.json[0].id;
    if (posted) createdMessageId = post.json[0].id;
    check('member: can post a message', !!posted, `HTTP ${post.status} ${JSON.stringify(post.json)}`);

    const lk = await livekitToken(jwt);
    check('member: livekit-token mints (200)', lk.status === 200 && lk.json && lk.json.token, `HTTP ${lk.status} ${JSON.stringify(lk.json)}`);

    if (lk.status === 200 && lk.json.token) {
      const claims = decodeJwtPayload(lk.json.token);
      const meta = JSON.parse(claims.metadata || '{}');
      check('member: no email anywhere in LiveKit JWT',
        !JSON.stringify(claims).includes(email),
        `token claims leak the email: ${JSON.stringify(meta)}`);
      const ttl = claims.exp - Math.floor(Date.now() / 1000);
      check('member: token TTL <= 15 min', ttl > 0 && ttl <= 15 * 60 + 30, `ttl=${ttl}s`);
      check('member: canPublish=true for role member', claims.video && claims.video.canPublish === true, JSON.stringify(claims.video));
      check('member: display name is not the email', claims.name !== email, `name=${claims.name}`);
    }
  }
} catch (err) {
  console.error('FATAL:', err.message);
  failures += 1;
} finally {
  await cleanup();
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
