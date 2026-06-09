#!/usr/bin/env node
/**
 * regression-test.mjs — End-to-end regression test for member submission pipeline
 *
 * Uses the AI portal (submit-member logic inline) to:
 *   1. Submit a clearly-marked TEST submission through the Netlify function
 *   2. Verify the row actually persisted in Supabase (read-back via service-role key)
 *   3. Clean up — delete the test row (uses admin DELETE RLS policy)
 *
 * USAGE
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/regression-test.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node tools/regression-test.mjs --endpoint http://localhost:8888/.netlify/functions/submit-assessment
 *
 * The test fails (exit 1) if any step fails. Pass = exit 0.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const DEFAULT_ENDPOINT = 'https://legends-membership.netlify.app/.netlify/functions/submit-assessment';

const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is required.');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node tools/regression-test.mjs');
  process.exit(1);
}

const args = process.argv.slice(2);
let endpoint = DEFAULT_ENDPOINT;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--endpoint' && args[i + 1]) endpoint = args[++i];
}

// ── Test payload ──────────────────────────────────────────────────────────────
// Marked as TEST data in every string field so it's clearly identifiable.

const TEST_MARKER = '[REGRESSION-TEST]';
const TEST_EMAIL = 'regression-test@legends-test.invalid';

const testPayload = {
  first_name: `${TEST_MARKER} Auto`,
  last_name: 'Test',
  email: TEST_EMAIL,
  leagues: 'NBA',
  years_since_retirement: '0-5',
  membership_status: 'test',
  location: 'Test City, TC',
  referral: 'automated-test',
  cam_connection: '3',
  cam_open: `${TEST_MARKER} Automated regression test submission — safe to delete.`,
  tr_open: `${TEST_MARKER} Created by regression-test.mjs on ${new Date().toISOString()}`,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function pass(msg) { console.log(`  ✓ ${msg}`); }
function fail(msg) { console.error(`  ✗ ${msg}`); process.exit(1); }

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

// ── Run test ──────────────────────────────────────────────────────────────────

console.log('Legends Member Submission — Regression Test');
console.log(`Endpoint: ${endpoint}`);
console.log('');

// STEP 1: Submit via the function (same path as human form)
console.log('Step 1: Submitting test assessment via Netlify function...');
let submitResp;
try {
  submitResp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload),
  });
} catch (err) {
  fail(`Network error reaching function: ${err.message}`);
}

if (submitResp.status === 503) {
  fail('Function returned 503 — SUPABASE_SERVICE_ROLE_KEY is not set in Netlify environment.');
}
if (!submitResp.ok) {
  const body = await submitResp.text();
  fail(`Function returned HTTP ${submitResp.status}: ${body}`);
}

const submitBody = await submitResp.json();
pass(`Function accepted submission (HTTP ${submitResp.status}): ${submitBody.message}`);

// STEP 2: Read back from Supabase to confirm the row was actually written
console.log('\nStep 2: Verifying row persisted in Supabase...');

// Wait a moment for any async propagation (Supabase is synchronous, but be safe)
await new Promise(r => setTimeout(r, 500));

const readResult = await supabaseRequest(
  'GET',
  `/rest/v1/assessment_submissions?submitter_email=eq.${encodeURIComponent(TEST_EMAIL)}&select=id,first_name,last_name,submitter_email,cam_open,created_at&order=created_at.desc&limit=5`
);

if (!readResult.ok) {
  fail(`Supabase read failed (HTTP ${readResult.status}): ${JSON.stringify(readResult.json)}`);
}

const rows = readResult.json;
if (!Array.isArray(rows) || rows.length === 0) {
  fail('No row found in Supabase — submission did NOT persist. Bug is still present.');
}

const row = rows[0];
if (!row.first_name || !row.first_name.includes('[REGRESSION-TEST]')) {
  fail(`Row found but first_name does not contain test marker: ${row.first_name}`);
}

pass(`Row confirmed in Supabase (id: ${row.id})`);
pass(`  first_name: ${row.first_name}`);
pass(`  submitter_email: ${row.submitter_email}`);
pass(`  created_at: ${row.created_at}`);

// STEP 3: Clean up — delete the test row(s)
console.log('\nStep 3: Cleaning up test row(s)...');

const deleteResult = await supabaseRequest(
  'DELETE',
  `/rest/v1/assessment_submissions?submitter_email=eq.${encodeURIComponent(TEST_EMAIL)}`
);

if (!deleteResult.ok) {
  fail(`Supabase delete failed (HTTP ${deleteResult.status}): ${JSON.stringify(deleteResult.json)}`);
}

pass(`Test row(s) deleted (HTTP ${deleteResult.status})`);

// STEP 4: Confirm deletion
const confirmResult = await supabaseRequest(
  'GET',
  `/rest/v1/assessment_submissions?submitter_email=eq.${encodeURIComponent(TEST_EMAIL)}&select=id`
);

if (!confirmResult.ok) {
  fail(`Confirm-delete read failed: ${JSON.stringify(confirmResult.json)}`);
}

if (!Array.isArray(confirmResult.json) || confirmResult.json.length > 0) {
  fail(`Row still present after delete — ${confirmResult.json.length} row(s) remain.`);
}

pass('Deletion confirmed — no test rows remain.');

// ── Done ──────────────────────────────────────────────────────────────────────
console.log('\n✓ All steps passed — member submission pipeline is working end-to-end.\n');
