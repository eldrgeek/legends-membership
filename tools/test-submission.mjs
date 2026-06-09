#!/usr/bin/env node
/**
 * test-submission.mjs — Regression test for the member submission pipeline.
 *
 * Wraps the existing regression-test.mjs logic and also tests
 * submit-recommendation (idea submissions) if the table exists.
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/test-submission.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/test-submission.mjs --endpoint http://localhost:8888/.netlify/functions/submit-assessment
 *
 * Exits 0 on PASS, 1 on FAIL.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const DEFAULT_ASSESSMENT_ENDPOINT = 'https://legends-membership.netlify.app/.netlify/functions/submit-assessment';
const DEFAULT_RECOMMENDATION_ENDPOINT = 'https://legends-membership.netlify.app/.netlify/functions/submit-recommendation';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required.');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node tools/test-submission.mjs');
  process.exit(1);
}

const args = process.argv.slice(2);
let assessmentEndpoint = DEFAULT_ASSESSMENT_ENDPOINT;
let recommendationEndpoint = DEFAULT_RECOMMENDATION_ENDPOINT;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--endpoint' && args[i + 1]) {
    // If a base URL is given, derive both endpoints
    const base = args[++i].replace(/\/$/, '');
    assessmentEndpoint = base + '/submit-assessment';
    recommendationEndpoint = base + '/submit-recommendation';
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function pass(msg) { console.log("  PASS " + msg); passed++; }
function fail(msg) { console.error("  FAIL " + msg); failed++; }

async function supabaseRequest(method, path, body) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { ok: res.ok, status: res.status, json };
}

// ── Test 1: Assessment submission pipeline ────────────────────────────────────

console.log('');
console.log('=== Legends Member Submission — Regression Test ===');
console.log('Assessment endpoint: ' + assessmentEndpoint);
console.log('Recommendation endpoint: ' + recommendationEndpoint);
console.log('');

const TEST_MARKER = '[REGRESSION-TEST]';
const TEST_EMAIL = 'regression-test@legends-test.invalid';

console.log('--- TEST 1: Assessment Submission Pipeline ---');

const testPayload = {
  first_name: TEST_MARKER + ' Auto',
  last_name: 'Test',
  email: TEST_EMAIL,
  leagues: 'NBA',
  years_since_retirement: '0-5',
  membership_status: 'test',
  location: 'Test City, TC',
  referral: 'automated-test',
  cam_connection: '3',
  cam_open: TEST_MARKER + ' Automated regression test — safe to delete.',
  tr_open: TEST_MARKER + ' Created by test-submission.mjs on ' + new Date().toISOString(),
};

// Step 1a: Submit via Netlify function
console.log('Step 1a: Submitting test assessment via Netlify function...');
let submitResp;
try {
  submitResp = await fetch(assessmentEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
  });
} catch (err) {
  fail('Network error reaching assessment function: ' + err.message);
  process.exit(1);
}

if (submitResp.status === 503) {
  fail('Assessment function returned 503 — SUPABASE_SERVICE_ROLE_KEY not set in Netlify.');
  process.exit(1);
}
if (!submitResp.ok) {
  const b = await submitResp.text();
  fail('Assessment function returned HTTP ' + submitResp.status + ': ' + b);
  process.exit(1);
}

const submitBody = await submitResp.json();
pass('Assessment function accepted submission (HTTP ' + submitResp.status + '): ' + (submitBody.message || 'ok'));

// Step 1b: Read back from Supabase
console.log('Step 1b: Verifying assessment row persisted in Supabase...');
await new Promise(r => setTimeout(r, 500));

const readResult = await supabaseRequest(
  'GET',
  '/rest/v1/assessment_submissions?submitter_email=eq.' + encodeURIComponent(TEST_EMAIL) +
    '&select=id,first_name,last_name,submitter_email,created_at&order=created_at.desc&limit=5'
);

if (!readResult.ok) {
  fail('Supabase read failed (HTTP ' + readResult.status + '): ' + JSON.stringify(readResult.json));
  process.exit(1);
}

const rows = readResult.json;
if (!Array.isArray(rows) || rows.length === 0) {
  fail('No assessment row found in Supabase — submission did NOT persist.');
  process.exit(1);
}

const row = rows[0];
if (!row.first_name || !row.first_name.includes('[REGRESSION-TEST]')) {
  fail('Row found but first_name does not contain test marker: ' + row.first_name);
  process.exit(1);
}

pass('Assessment row confirmed in Supabase (id: ' + row.id + ')');
pass('  first_name: ' + row.first_name);
pass('  created_at: ' + row.created_at);

// Step 1c: Delete test row
console.log('Step 1c: Cleaning up assessment test row...');
const deleteResult = await supabaseRequest(
  'DELETE',
  '/rest/v1/assessment_submissions?submitter_email=eq.' + encodeURIComponent(TEST_EMAIL)
);

if (!deleteResult.ok) {
  fail('Supabase delete failed (HTTP ' + deleteResult.status + '): ' + JSON.stringify(deleteResult.json));
  process.exit(1);
}
pass('Assessment test row deleted (HTTP ' + deleteResult.status + ')');

// Step 1d: Confirm deletion
const confirmResult = await supabaseRequest(
  'GET',
  '/rest/v1/assessment_submissions?submitter_email=eq.' + encodeURIComponent(TEST_EMAIL) + '&select=id'
);

if (!Array.isArray(confirmResult.json) || confirmResult.json.length > 0) {
  fail('Assessment row still present after delete (' + (confirmResult.json.length || '?') + ' rows remain).');
  process.exit(1);
}
pass('Assessment deletion confirmed — no test rows remain.');

// ── Test 2: Recommendation (idea) submission pipeline ─────────────────────────

console.log('');
console.log('--- TEST 2: Recommendation (Idea) Submission Pipeline ---');

const TEST_IDEA_EMAIL = 'regression-test-idea@legends-test.invalid';
const ideaPayload = {
  name: TEST_MARKER + ' AutoIdea',
  email: TEST_IDEA_EMAIL,
  idea: TEST_MARKER + ' Automated idea regression test — safe to delete. Submitted at ' + new Date().toISOString(),
};

// Step 2a: Submit via Netlify function
console.log('Step 2a: Submitting test idea via submit-recommendation function...');
let ideaResp;
try {
  ideaResp = await fetch(recommendationEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ideaPayload),
  });
} catch (err) {
  fail('Network error reaching recommendation function: ' + err.message);
  process.exit(1);
}

if (ideaResp.status === 503) {
  fail('Recommendation function returned 503 — SUPABASE_SERVICE_ROLE_KEY not set in Netlify.');
  process.exit(1);
}

const ideaBody = await ideaResp.json();

if (!ideaResp.ok) {
  // A 500 from this function most likely means the idea_submissions table does not
  // yet exist in Supabase (the function catches the Supabase error and returns 500
  // with a generic message to avoid leaking details). Verify by probing Supabase
  // directly, then decide whether to skip or fail.
  const probeResult = await supabaseRequest('GET', '/rest/v1/idea_submissions?limit=0&select=id');
  if (!probeResult.ok && JSON.stringify(probeResult.json).includes('PGRST205')) {
    console.log('  NOTE: submit-recommendation function is deployed but idea_submissions table not yet created.');
    console.log('  Apply supabase-idea-submissions.sql in the Supabase SQL editor to complete setup.');
    console.log('  SKIP: Test 2 skipped — table not ready.');
    console.log('');
  } else {
    fail('Recommendation function returned HTTP ' + ideaResp.status + ': ' + JSON.stringify(ideaBody));
    process.exit(1);
  }
} else {
  pass('Recommendation function accepted submission (HTTP ' + ideaResp.status + '): ' + (ideaBody.message || 'ok'));

  // Step 2b: Read back from Supabase
  console.log('Step 2b: Verifying idea row persisted in Supabase...');
  await new Promise(r => setTimeout(r, 500));

  const ideaRead = await supabaseRequest(
    'GET',
    '/rest/v1/idea_submissions?email=eq.' + encodeURIComponent(TEST_IDEA_EMAIL) +
      '&select=id,name,email,created_at&order=created_at.desc&limit=5'
  );

  if (!ideaRead.ok) {
    fail('Supabase idea read failed (HTTP ' + ideaRead.status + '): ' + JSON.stringify(ideaRead.json));
    process.exit(1);
  }

  const ideaRows = ideaRead.json;
  if (!Array.isArray(ideaRows) || ideaRows.length === 0) {
    fail('No idea row found in Supabase — idea submission did NOT persist.');
    process.exit(1);
  }

  pass('Idea row confirmed in Supabase (id: ' + ideaRows[0].id + ')');
  pass('  name: ' + ideaRows[0].name);
  pass('  created_at: ' + ideaRows[0].created_at);

  // Step 2c: Delete test idea row
  console.log('Step 2c: Cleaning up idea test row...');
  const ideaDelete = await supabaseRequest(
    'DELETE',
    '/rest/v1/idea_submissions?email=eq.' + encodeURIComponent(TEST_IDEA_EMAIL)
  );

  if (!ideaDelete.ok) {
    fail('Supabase idea delete failed: ' + JSON.stringify(ideaDelete.json));
    process.exit(1);
  }
  pass('Idea test row deleted.');
}

// ── Summary ───────────────────────────────────────────────────────────────────

console.log('');
if (failed === 0) {
  console.log('RESULT: PASS — all ' + passed + ' checks passed.');
  process.exit(0);
} else {
  console.log('RESULT: FAIL — ' + failed + ' check(s) failed, ' + passed + ' passed.');
  process.exit(1);
}
