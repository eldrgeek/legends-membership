#!/usr/bin/env node
/**
 * submit-member.mjs — AI Portal for Legends member assessments
 *
 * Dual-portal pattern: this is the AI/agent input path for the same capability
 * the human form uses. Both portals call the same server-side function
 * (/.netlify/functions/submit-assessment) which uses the service-role key.
 *
 * USAGE
 *   node tools/submit-member.mjs tools/example-submission.yaml
 *   node tools/submit-member.mjs submission.json
 *   cat submission.yaml | node tools/submit-member.mjs -
 *
 * OPTIONS
 *   --endpoint <url>  Override function URL (default: https://legends-membership.netlify.app/.netlify/functions/submit-assessment)
 *   --dry-run         Parse and validate but do not submit
 *
 * SCHEMA  (all fields optional except first_name)
 *   See REQUIRED_FIELDS and OPTIONAL_FIELDS below.
 *   YAML (preferred for readability) or JSON both work — js-yaml reads both.
 */

import { readFileSync } from 'fs';
import { load as yamlLoad } from 'js-yaml';

const DEFAULT_ENDPOINT = 'https://legends-membership.netlify.app/.netlify/functions/submit-assessment';

// ── Schema ────────────────────────────────────────────────────────────────────

const REQUIRED_FIELDS = ['first_name'];

// Valid field names accepted by the submission function
const VALID_FIELDS = new Set([
  'first_name', 'last_name', 'email', 'leagues',
  'years_since_retirement', 'membership_status', 'location', 'referral',
  'cam_connection', 'cam_frequency', 'cam_barriers', 'cam_engagement', 'cam_isolation', 'cam_open',
  'health_physical', 'health_mental', 'health_access', 'health_conditions', 'health_support', 'health_open',
  'fin_stability', 'fin_income', 'fin_plan', 'fin_challenges', 'fin_support',
  'com_local', 'com_skills', 'com_interests', 'com_mentoring', 'com_barriers',
  'fam_relationships', 'fam_support', 'fam_impact', 'fam_support_needed', 'fam_open',
  'tr_overall', 'tr_unsettled', 'tr_immediate', 'tr_vision', 'tr_readiness', 'tr_open',
]);

// ── Argument parsing ──────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let inputArg = null;
let endpoint = DEFAULT_ENDPOINT;
let dryRun = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--endpoint' && args[i + 1]) { endpoint = args[++i]; }
  else if (args[i] === '--dry-run') { dryRun = true; }
  else if (!inputArg) { inputArg = args[i]; }
}

if (!inputArg) {
  console.error('Usage: node tools/submit-member.mjs <file.yaml|file.json|-> [--endpoint <url>] [--dry-run]');
  process.exit(1);
}

// ── Read input ────────────────────────────────────────────────────────────────

let raw;
if (inputArg === '-') {
  raw = readFileSync('/dev/stdin', 'utf8');
} else {
  try {
    raw = readFileSync(inputArg, 'utf8');
  } catch (err) {
    console.error(`Cannot read file: ${inputArg}\n${err.message}`);
    process.exit(1);
  }
}

// ── Parse (js-yaml handles both YAML and JSON) ────────────────────────────────

let data;
try {
  data = yamlLoad(raw);
} catch (err) {
  console.error(`Parse error: ${err.message}`);
  process.exit(1);
}

if (!data || typeof data !== 'object' || Array.isArray(data)) {
  console.error('Input must be a YAML/JSON object (key-value mapping).');
  process.exit(1);
}

// ── Validate ──────────────────────────────────────────────────────────────────

const errors = [];

for (const field of REQUIRED_FIELDS) {
  if (!data[field] || !String(data[field]).trim()) {
    errors.push(`Missing required field: ${field}`);
  }
}

const unknown = Object.keys(data).filter(k => !VALID_FIELDS.has(k));
if (unknown.length) {
  errors.push(`Unknown fields (will be ignored by server): ${unknown.join(', ')}`);
}

if (errors.length) {
  const fatal = errors.filter(e => e.startsWith('Missing'));
  const warnings = errors.filter(e => !e.startsWith('Missing'));
  if (warnings.length) console.warn('WARN:', warnings.join('\n      '));
  if (fatal.length) {
    console.error('VALIDATION ERROR:', fatal.join('\n                  '));
    process.exit(1);
  }
}

// ── Build payload (only known fields) ────────────────────────────────────────

const payload = {};
for (const key of VALID_FIELDS) {
  if (data[key] !== undefined && data[key] !== null) {
    payload[key] = String(data[key]);
  }
}

// ── Submit ────────────────────────────────────────────────────────────────────

console.log(`Submitting assessment for: ${payload.first_name} ${payload.last_name || ''}`.trim());
console.log(`Endpoint: ${endpoint}`);

if (dryRun) {
  console.log('\n--dry-run: payload would be:');
  console.log(JSON.stringify(payload, null, 2));
  console.log('\nDry run complete — nothing submitted.');
  process.exit(0);
}

let resp;
try {
  resp = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
} catch (err) {
  console.error(`Network error: ${err.message}`);
  process.exit(1);
}

const body = await resp.text();
let json;
try { json = JSON.parse(body); } catch { json = { raw: body }; }

if (resp.ok) {
  console.log(`\n✓ Success (HTTP ${resp.status}): ${json.message || 'submitted'}`);
} else {
  console.error(`\n✗ Error (HTTP ${resp.status}): ${json.error || body}`);
  process.exit(1);
}
