'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHAT_HTML = fs.readFileSync(path.join(ROOT, 'community-chat.html'), 'utf8');
const VIDEO_HTML = fs.readFileSync(path.join(ROOT, 'community-video.html'), 'utf8');
const COMMUNITY_CHAT_JS = fs.readFileSync(path.join(ROOT, 'js/soma-community-chat.js'), 'utf8');
const COMMUNITY_VIDEO_JS = fs.readFileSync(path.join(ROOT, 'js/soma-community-video.js'), 'utf8');
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

  test('chat page is wired to the Supabase realtime chat client', () => {
    assert.match(CHAT_HTML, /id="chat-messages"/);
    assert.match(CHAT_HTML, /id="chat-form"/);
    assert.match(CHAT_HTML, /\/js\/soma-community-chat\.js/);
    assert.match(CHAT_HTML, /SomaCommunityChat\.initWithSession/);
    assert.match(COMMUNITY_CHAT_JS, /global\.SomaCommunityChat = api/);
    assert.match(COMMUNITY_CHAT_JS, /global\.LegendsCommunityChat = api/);
  });

  test('video page is wired to LiveKit and the token-backed meeting UI', () => {
    assert.match(VIDEO_HTML, /livekit-client\/dist\/livekit-client\.umd\.min\.js/);
    assert.match(VIDEO_HTML, /id="video-room-name"/);
    assert.match(VIDEO_HTML, /id="video-grid"/);
    assert.match(VIDEO_HTML, /\/js\/soma-community-video\.js/);
    assert.match(VIDEO_HTML, /SomaCommunityVideo\.initWithSession/);
    assert.match(COMMUNITY_VIDEO_JS, /global\.SomaCommunityVideo = api/);
    assert.match(COMMUNITY_VIDEO_JS, /global\.LegendsCommunityVideo = api/);
  });

  test('video renderer does not create visible participant tiles for audio-only tracks', () => {
    assert.match(COMMUNITY_VIDEO_JS, /track\.kind && track\.kind !== 'video'/);
    assert.match(COMMUNITY_VIDEO_JS, /video-audio-sink/);
    assert.match(COMMUNITY_VIDEO_JS, /audioSink\(\)\.appendChild\(audio\)/);
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
