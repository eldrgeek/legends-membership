/**
 * submit-assessment.js — Netlify Function for Legends of Basketball assessment form.
 *
 * Accepts the member needs assessment as a JSON POST, applies:
 *   - Honeypot field check (bot detection)
 *   - Required-fields validation
 *   - Request size guard (32 KB max)
 *   - Inserts into public.assessment_submissions using the service-role key
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.
 * If absent, returns 503 — deploying without the key is safe (stub state).
 *
 * To enable:
 *   1. Get the service_role key from:
 *      https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl/settings/api
 *      (Project Settings → API → service_role — KEEP SECRET)
 *   2. Add it in Netlify:
 *      Site → Site settings → Environment variables → New variable
 *      Key: SUPABASE_SERVICE_ROLE_KEY   Value: <paste key>
 *   3. Trigger a new deploy so the variable takes effect.
 *   4. Also apply soma-assessment-submissions.sql in Supabase SQL editor.
 *
 * The service-role key bypasses RLS — it must NEVER appear in client-side code or the repo.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const MAX_BODY_BYTES = 32768;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

function str(val, max) {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  return s.length > 0 ? s.slice(0, max || 2000) : null;
}

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed' });
  }

  // ── Service-role key guard ───────────────────────────────────────────────
  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return jsonResponse(503, {
      error: 'submission backend not configured',
      message: 'Form submissions are not yet enabled. To enable: apply soma-assessment-submissions.sql in Supabase, then set SUPABASE_SERVICE_ROLE_KEY in Netlify → Site settings → Environment variables and redeploy.',
    });
  }

  // ── Size guard ───────────────────────────────────────────────────────────
  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Request too large' });
  }

  // ── Parse body ───────────────────────────────────────────────────────────
  let body;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // ── Honeypot check ───────────────────────────────────────────────────────
  // Bots fill in hidden fields; real users never see or touch this field.
  if (body.website && String(body.website).trim() !== '') {
    // Return 200 to avoid leaking the detection mechanism to bots.
    return jsonResponse(200, { message: 'Received' });
  }

  // ── Required fields ──────────────────────────────────────────────────────
  if (!body.first_name || !String(body.first_name).trim()) {
    return jsonResponse(400, { error: 'first_name is required' });
  }

  // ── Build insert row ─────────────────────────────────────────────────────
  const row = {
    first_name:            str(body.first_name, 100),
    last_name:             str(body.last_name, 100),
    submitter_email:       str(body.email, 255),
    leagues:               str(body.leagues),
    years_since_retirement: str(body.years_since_retirement, 100),
    membership_status:     str(body.membership_status, 100),
    location:              str(body.location, 200),
    referral:              str(body.referral, 100),
    cam_connection:        str(body.cam_connection, 10),
    cam_frequency:         str(body.cam_frequency, 50),
    cam_barriers:          str(body.cam_barriers),
    cam_engagement:        str(body.cam_engagement),
    cam_isolation:         str(body.cam_isolation, 10),
    cam_open:              str(body.cam_open),
    health_physical:       str(body.health_physical, 10),
    health_mental:         str(body.health_mental, 10),
    health_access:         str(body.health_access, 50),
    health_conditions:     str(body.health_conditions),
    health_support:        str(body.health_support),
    health_open:           str(body.health_open),
    fin_stability:         str(body.fin_stability, 10),
    fin_income:            str(body.fin_income),
    fin_plan:              str(body.fin_plan, 50),
    fin_challenges:        str(body.fin_challenges, 50),
    fin_support:           str(body.fin_support),
    com_local:             str(body.com_local, 10),
    com_skills:            str(body.com_skills, 10),
    com_interests:         str(body.com_interests),
    com_mentoring:         str(body.com_mentoring, 50),
    com_barriers:          str(body.com_barriers),
    fam_relationships:     str(body.fam_relationships, 10),
    fam_support:           str(body.fam_support, 50),
    fam_impact:            str(body.fam_impact, 50),
    fam_support_needed:    str(body.fam_support_needed),
    fam_open:              str(body.fam_open),
    tr_overall:            str(body.tr_overall, 50),
    tr_unsettled:          str(body.tr_unsettled),
    tr_immediate:          str(body.tr_immediate, 50),
    tr_vision:             str(body.tr_vision),
    tr_readiness:          str(body.tr_readiness, 10),
    tr_open:               str(body.tr_open),
    source:                'web',
    ip:                    str(event.headers['x-forwarded-for'] || event.headers['client-ip'] || null, 100),
    user_agent:            str(event.headers['user-agent'] || null, 500),
    payload:               body,
  };

  // ── Insert into Supabase ─────────────────────────────────────────────────
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/assessment_submissions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${SERVICE_KEY}`,
        apikey: SERVICE_KEY,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(row),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Supabase insert failed:', res.status, errText);
      return jsonResponse(500, { error: 'Failed to record submission' });
    }

    return jsonResponse(200, { message: 'Assessment submitted successfully' });
  } catch (err) {
    console.error('Insert error:', err);
    return jsonResponse(500, { error: 'Failed to record submission' });
  }
};
