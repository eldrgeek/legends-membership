/**
 * submit-feedback.js — Netlify Function for Bill-mediated feedback submissions.
 *
 * Accepts JSON POST from the soma-guide engine (Bill widget) when a member
 * reports a bug or submits a feature request via the conversation. Stores the
 * submission in public.bill_feedback using the service-role key (bypasses RLS).
 *
 * This is the "AI manager as feedback membrane": member → Bill → Greg.
 * Members are NOT trusted to write directly; all submissions route here
 * and surface in admin.html for Greg's review.
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables.
 *
 * To enable, apply this SQL in the Supabase SQL editor:
 *   https://supabase.com/dashboard/project/omfwcodoimjmbrhssvfl/sql/new
 *
 *   CREATE TABLE IF NOT EXISTS public.bill_feedback (
 *     id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *     type           text NOT NULL CHECK (type IN ('bug', 'feature')),
 *     description    text NOT NULL,
 *     member_name    text,
 *     member_email   text,
 *     page_context   text,
 *     assistant_id   text DEFAULT 'legends-bill',
 *     source         text DEFAULT 'bill-widget',
 *     ip             text,
 *     user_agent     text,
 *     status         text DEFAULT 'new',
 *     created_at     timestamptz NOT NULL DEFAULT now()
 *   );
 *   ALTER TABLE public.bill_feedback ENABLE ROW LEVEL SECURITY;
 *   -- No public access — all reads/writes via service-role function only.
 */

const SUPABASE_URL = 'https://omfwcodoimjmbrhssvfl.supabase.co';
const MAX_BODY_BYTES = 16384;

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

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) {
    return jsonResponse(503, {
      error: 'feedback backend not configured',
      message: 'Bill feedback is not yet enabled. Set SUPABASE_SERVICE_ROLE_KEY in Netlify environment variables and redeploy.',
    });
  }

  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) {
    return jsonResponse(413, { error: 'Request too large' });
  }

  let body;
  try {
    body = JSON.parse(bodyStr);
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON' });
  }

  // Honeypot
  if (body.website && String(body.website).trim() !== '') {
    return jsonResponse(200, { message: 'Received' });
  }

  const type = str(body.type, 20);
  if (!type || !['bug', 'feature'].includes(type)) {
    return jsonResponse(400, { error: 'type must be "bug" or "feature"' });
  }

  const description = str(body.description, 5000);
  if (!description) {
    return jsonResponse(400, { error: 'description is required' });
  }

  const memberEmail = str(body.member_email, 255);

  /* Greg (gfos44@gmail.com) submits on his own authority — auto-approve. */
  const GREG_EMAIL = 'gfos44@gmail.com';
  const autoApprove = memberEmail && memberEmail.toLowerCase() === GREG_EMAIL;

  const row = {
    type,
    description,
    member_name:   str(body.member_name, 120),
    member_email:  memberEmail,
    page_context:  str(body.page_context, 500),
    assistant_id:  str(body.assistant_id, 60) || 'legends-bill',
    source:        'bill-widget',
    ip:            str(event.headers['x-forwarded-for'] || event.headers['client-ip'] || null, 100),
    user_agent:    str(event.headers['user-agent'] || null, 500),
    status:        autoApprove ? 'greg-approved' : 'new',
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/bill_feedback`, {
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
      return jsonResponse(500, { error: 'Failed to record feedback' });
    }

    return jsonResponse(200, { message: 'Feedback submitted — Greg will review it shortly. Thank you!' });
  } catch (err) {
    console.error('Insert error:', err);
    return jsonResponse(500, { error: 'Failed to record feedback' });
  }
};
