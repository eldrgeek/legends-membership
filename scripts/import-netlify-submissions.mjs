#!/usr/bin/env node
/**
 * import-netlify-submissions.mjs
 *
 * Imports exported Netlify Forms submissions into Supabase assessment_submissions.
 * Run this locally — it uses the service-role key (server-side only, never in git).
 *
 * PREREQUISITES:
 *   1. Apply soma-assessment-submissions.sql in Supabase SQL editor first.
 *   2. Get the service_role key from:
 *      https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl/settings/api
 *      (Project Settings → API → service_role key)
 *
 * MIKE'S STEPS TO EXPORT FROM NETLIFY:
 *   1. Go to https://app.netlify.com/sites/legends-membership/forms
 *   2. Click the "member-assessment" form
 *   3. Click "Download" (top-right) → choose CSV or JSON
 *   4. Save the file somewhere accessible (e.g. ~/Downloads/netlify-assessment.csv)
 *
 * USAGE (CSV):
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-netlify-submissions.mjs ./netlify-assessment.csv
 *
 * USAGE (JSON — Netlify's JSON export format):
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-netlify-submissions.mjs ./netlify-assessment.json
 *
 * The script is idempotent-safe in that it does not deduplicate — run it once.
 * Rows are inserted with source='migrated' so they're distinguishable from new web submissions.
 */

import { readFileSync } from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY environment variable is not set.');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-netlify-submissions.mjs <file.csv|file.json>');
  process.exit(1);
}

const filePath = process.argv[2];
if (!filePath) {
  console.error('ERROR: No file path provided.');
  console.error('Usage: SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/import-netlify-submissions.mjs <file.csv|file.json>');
  process.exit(1);
}

const fileContent = readFileSync(filePath, 'utf8');
const isJson = filePath.toLowerCase().endsWith('.json');

// ── Parse submissions ────────────────────────────────────────────────────────

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]);
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = vals[i] !== undefined ? vals[i].trim() : ''; });
    return obj;
  });
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

let submissions;
if (isJson) {
  const parsed = JSON.parse(fileContent);
  // Netlify JSON export: array of objects, each with a "data" key containing field values
  submissions = Array.isArray(parsed) ? parsed : (parsed.submissions || []);
  submissions = submissions.map(s => {
    const fields = {};
    if (s.data && Array.isArray(s.data)) {
      s.data.forEach(field => { fields[field.name] = field.value || ''; });
    } else if (s.data && typeof s.data === 'object') {
      Object.assign(fields, s.data);
    } else {
      Object.assign(fields, s);
    }
    fields._created_at = s.created_at || s.submittedAt || null;
    return fields;
  });
} else {
  submissions = parseCSV(fileContent);
}

console.log(`Parsed ${submissions.length} submissions from ${filePath}`);
if (submissions.length === 0) {
  console.log('Nothing to import.');
  process.exit(0);
}

// ── Map to assessment_submissions columns ────────────────────────────────────

function str(val, max) {
  if (!val) return null;
  const s = String(val).trim();
  return s.length > 0 ? s.slice(0, max || 2000) : null;
}

function mapRow(s) {
  return {
    first_name:             str(s.first_name, 100),
    last_name:              str(s.last_name, 100),
    submitter_email:        str(s.email, 255),
    leagues:                str(s.leagues),
    years_since_retirement: str(s.years_since_retirement, 100),
    membership_status:      str(s.membership_status, 100),
    location:               str(s.location, 200),
    referral:               str(s.referral, 100),
    cam_connection:         str(s.cam_connection, 10),
    cam_frequency:          str(s.cam_frequency, 50),
    cam_barriers:           str(s.cam_barriers),
    cam_engagement:         str(s.cam_engagement),
    cam_isolation:          str(s.cam_isolation, 10),
    cam_open:               str(s.cam_open),
    health_physical:        str(s.health_physical, 10),
    health_mental:          str(s.health_mental, 10),
    health_access:          str(s.health_access, 50),
    health_conditions:      str(s.health_conditions),
    health_support:         str(s.health_support),
    health_open:            str(s.health_open),
    fin_stability:          str(s.fin_stability, 10),
    fin_income:             str(s.fin_income),
    fin_plan:               str(s.fin_plan, 50),
    fin_challenges:         str(s.fin_challenges, 50),
    fin_support:            str(s.fin_support),
    com_local:              str(s.com_local, 10),
    com_skills:             str(s.com_skills, 10),
    com_interests:          str(s.com_interests),
    com_mentoring:          str(s.com_mentoring, 50),
    com_barriers:           str(s.com_barriers),
    fam_relationships:      str(s.fam_relationships, 10),
    fam_support:            str(s.fam_support, 50),
    fam_impact:             str(s.fam_impact, 50),
    fam_support_needed:     str(s.fam_support_needed),
    fam_open:               str(s.fam_open),
    tr_overall:             str(s.tr_overall, 50),
    tr_unsettled:           str(s.tr_unsettled),
    tr_immediate:           str(s.tr_immediate, 50),
    tr_vision:              str(s.tr_vision),
    tr_readiness:           str(s.tr_readiness, 10),
    tr_open:                str(s.tr_open),
    source:                 'migrated',
    payload:                s,
    ...(s._created_at ? { created_at: s._created_at } : {}),
  };
}

// ── Insert in batches ────────────────────────────────────────────────────────

const BATCH_SIZE = 50;
let inserted = 0;
let failed = 0;

async function insertBatch(rows) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/assessment_submissions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
}

const rows = submissions.map(mapRow);
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  const batch = rows.slice(i, i + BATCH_SIZE);
  try {
    await insertBatch(batch);
    inserted += batch.length;
    console.log(`  Inserted ${inserted}/${rows.length}…`);
  } catch (err) {
    console.error(`  BATCH FAILED (rows ${i}–${i + batch.length - 1}):`, err.message);
    failed += batch.length;
  }
}

console.log(`\nDone. ${inserted} inserted, ${failed} failed.`);
if (failed > 0) {
  console.error('Some rows failed — check the errors above.');
  process.exit(1);
}
