'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHAT_HTML = fs.readFileSync(path.join(ROOT, 'community-chat.html'), 'utf8');
const VIDEO_HTML = fs.readFileSync(path.join(ROOT, 'community-video.html'), 'utf8');
// The community pages mount React islands (chatscope chat / LiveKit video) via
// importmap ESM modules. See community-chat.html / community-video.html and
// commit a1f89647 "Community: tab-aware identity, LiveKit video UI, chatscope chat".
const CHAT_APP_JS = fs.readFileSync(path.join(ROOT, 'js/legends-chat-app.js'), 'utf8');
const VIDEO_APP_JS = fs.readFileSync(path.join(ROOT, 'js/legends-video-app.js'), 'utf8');
const SOMA_AUTH_JS = fs.readFileSync(path.join(ROOT, 'js/soma-auth.js'), 'utf8');
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'migrations/community_messages.sql'), 'utf8');
const FUNCTION_PATH = path.join(ROOT, 'netlify/functions/livekit-token.js');

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

function decodePayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
}

function loadLiveKitFunction(env = {}) {
  process.env = { ...ORIGINAL_ENV, ...env };
  delete require.cache[require.resolve(FUNCTION_PATH)];
  return require(FUNCTION_PATH).handler;
}

describe('Community chat and video wiring', () => {
  beforeEach(() => {
    global.fetch = ORIGINAL_FETCH;
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    global.fetch = ORIGINAL_FETCH;
    delete require.cache[require.resolve(FUNCTION_PATH)];
  });

  test('chat page mounts the chatscope React island wired to Supabase realtime', () => {
    // The page hosts a React island: a #chat-app mount point + the ESM module.
    assert.match(CHAT_HTML, /id="chat-app"/);
    assert.match(CHAT_HTML, /\/js\/legends-chat-app\.js/);
    assert.match(CHAT_HTML, /type="importmap"/);
    assert.match(CHAT_HTML, /@chatscope\/chat-ui-kit-react/);
    // The island mounts and talks to the shared Supabase client + realtime table.
    assert.match(CHAT_APP_JS, /document\.getElementById\('chat-app'\)/);
    assert.match(CHAT_APP_JS, /community_messages/);
    assert.match(CHAT_APP_JS, /Auth\.getClient/);
  });

  test('video page mounts the LiveKit React island wired to the token endpoint', () => {
    // LiveKit's prebuilt conferencing UI, mounted as a React island.
    assert.match(VIDEO_HTML, /id="video-app"/);
    assert.match(VIDEO_HTML, /\/js\/legends-video-app\.js/);
    assert.match(VIDEO_HTML, /@livekit\/components-react/);
    // The island uses LiveKit's prebuilt UI and fetches the room-scoped token.
    assert.match(VIDEO_APP_JS, /document\.getElementById\('video-app'\)/);
    assert.match(VIDEO_APP_JS, /id="video-room-name"/);
    assert.match(VIDEO_APP_JS, /\/\.netlify\/functions\/livekit-token/);
    assert.match(VIDEO_APP_JS, /LiveKitRoom/);
  });

  test('video uses LiveKit prebuilt UI which renders audio without visible tiles', () => {
    // Audio-only participants are handled by LiveKit's <RoomAudioRenderer/>,
    // not by manually-built participant tiles.
    assert.match(VIDEO_APP_JS, /VideoConference/);
    assert.match(VIDEO_APP_JS, /RoomAudioRenderer/);
  });

  test('SomaAuth exposes the shared Supabase client for authenticated community tools', () => {
    assert.match(SOMA_AUTH_JS, /getClient:\s*function/);
    assert.match(SOMA_AUTH_JS, /return _client/);
  });

  test('community messages migration creates realtime table with authenticated RLS policies', () => {
    assert.match(MIGRATION_SQL, /create table if not exists public\.community_messages/);
    assert.match(MIGRATION_SQL, /enable row level security/);
    assert.match(MIGRATION_SQL, /to authenticated\s+using \(true\)/);
    assert.match(MIGRATION_SQL, /with check \(auth\.uid\(\) = user_id\)/);
    assert.match(MIGRATION_SQL, /alter publication supabase_realtime add table public\.community_messages/);
  });

  test('LiveKit token endpoint rejects unsigned users', async () => {
    const handler = loadLiveKitFunction({
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      LIVEKIT_API_KEY: 'api-key',
      LIVEKIT_API_SECRET: 'api-secret',
      LIVEKIT_URL: 'wss://video.example.test',
    });

    const result = await handler({ httpMethod: 'POST', headers: {}, body: '{}' });
    assert.equal(result.statusCode, 401);
    assert.match(JSON.parse(result.body).error, /sign in/i);
  });

  test('LiveKit token endpoint returns a room-scoped token for verified users', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        id: 'user-123',
        email: 'member@example.com',
        user_metadata: { full_name: 'Member Example' },
      }),
    });
    const handler = loadLiveKitFunction({
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      LIVEKIT_API_KEY: 'api-key',
      LIVEKIT_API_SECRET: 'api-secret',
      LIVEKIT_URL: 'wss://video.example.test',
    });

    const result = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer access-token' },
      body: JSON.stringify({ room: 'Legends Community!', connectionId: 'tab-one' }),
    });

    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    const payload = decodePayload(body.token);
    assert.equal(body.url, 'wss://video.example.test');
    assert.equal(body.room, 'legends-community');
    assert.equal(body.identity, 'user-123-tab-one');
    assert.equal(payload.sub, 'user-123-tab-one');
    assert.equal(payload.name, 'Member Example');
    assert.equal(JSON.parse(payload.metadata).connectionId, 'tab-one');
    assert.equal(body.token.split('.').length, 3);
  });

  test('LiveKit token endpoint gives two tabs for the same user distinct participant identities', async () => {
    global.fetch = async () => ({
      ok: true,
      json: async () => ({
        id: 'user-123',
        email: 'member@example.com',
        user_metadata: { full_name: 'Member Example' },
      }),
    });
    const handler = loadLiveKitFunction({
      SUPABASE_SERVICE_ROLE_KEY: 'service-role',
      LIVEKIT_API_KEY: 'api-key',
      LIVEKIT_API_SECRET: 'api-secret',
      LIVEKIT_URL: 'wss://video.example.test',
    });

    const first = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer access-token' },
      body: JSON.stringify({ room: 'Legends Community!', connectionId: 'first-tab' }),
    });
    const second = await handler({
      httpMethod: 'POST',
      headers: { authorization: 'Bearer access-token' },
      body: JSON.stringify({ room: 'Legends Community!', connectionId: 'second-tab' }),
    });

    const firstBody = JSON.parse(first.body);
    const secondBody = JSON.parse(second.body);
    assert.notEqual(firstBody.identity, secondBody.identity);
    assert.equal(decodePayload(firstBody.token).sub, 'user-123-first-tab');
    assert.equal(decodePayload(secondBody.token).sub, 'user-123-second-tab');
  });
});
