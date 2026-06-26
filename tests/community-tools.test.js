'use strict';

const { describe, test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CHAT_HTML = fs.readFileSync(path.join(ROOT, 'community-chat.html'), 'utf8');
const VIDEO_HTML = fs.readFileSync(path.join(ROOT, 'community-video.html'), 'utf8');
const SOMA_AUTH_JS = fs.readFileSync(path.join(ROOT, 'js/soma-auth.js'), 'utf8');
const MIGRATION_SQL = fs.readFileSync(path.join(ROOT, 'migrations/community_messages.sql'), 'utf8');
const FUNCTION_PATH = path.join(ROOT, 'netlify/functions/livekit-token.js');

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = global.fetch;

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
    assert.match(CHAT_HTML, /\/js\/community-chat\.js/);
    assert.match(CHAT_HTML, /LegendsCommunityChat\.initWithSession/);
  });

  test('video page is wired to LiveKit and the token-backed meeting UI', () => {
    assert.match(VIDEO_HTML, /livekit-client\/dist\/livekit-client\.umd\.min\.js/);
    assert.match(VIDEO_HTML, /id="video-room-name"/);
    assert.match(VIDEO_HTML, /id="video-grid"/);
    assert.match(VIDEO_HTML, /\/js\/community-video\.js/);
    assert.match(VIDEO_HTML, /LegendsCommunityVideo\.initWithSession/);
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
      body: JSON.stringify({ room: 'Legends Community!' }),
    });

    assert.equal(result.statusCode, 200);
    const body = JSON.parse(result.body);
    assert.equal(body.url, 'wss://video.example.test');
    assert.equal(body.room, 'legends-community');
    assert.equal(body.token.split('.').length, 3);
  });
});
