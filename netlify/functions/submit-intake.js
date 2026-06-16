/**
 * submit-intake.js — Netlify Function: the unified change-request queue sink.
 *
 * Bill's conversational intake POSTs a structured request here; it lands in
 * public.change_requests with status 'new'. The email daemon polls that table
 * (alongside email) and runs each request through the same vet → role-route →
 * dispatch/approve → notify pipeline. One queue, two front doors.
 *
 * Service-role insert (members are not trusted to write directly). Requires
 * SUPABASE_SERVICE_ROLE_KEY in Netlify env (already set).
 *
 * Table SQL lives in templates/soma-affordances/sql/schema.sql (change_requests).
 */
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co';
const ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
const MAX_BODY_BYTES = 32768;

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type' },
    body: JSON.stringify(body),
  };
}
function str(v, max) { if (v == null) return null; var s = String(v).trim(); return s ? s.slice(0, max || 2000) : null; }

exports.handler = async function (event) {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Methods': 'POST, OPTIONS' }, body: '' };
  }
  if (event.httpMethod !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SERVICE_KEY) return jsonResponse(503, { error: 'intake backend not configured' });

  const bodyStr = event.body || '';
  if (Buffer.byteLength(bodyStr, 'utf8') > MAX_BODY_BYTES) return jsonResponse(413, { error: 'Request too large' });

  let b;
  try { b = JSON.parse(bodyStr); } catch { return jsonResponse(400, { error: 'Invalid JSON' }); }

  const description = str(b.description, 5000);
  if (!description) return jsonResponse(400, { error: 'description is required' });

  const email = str(b.requester_email, 255);
  const role = (email && ADMIN_EMAILS.indexOf(email.toLowerCase()) !== -1) ? 'owner'
             : (email ? 'member' : 'anon');

  const row = {
    source: str(b.source, 20) || 'bill',
    requester_name: str(b.requester_name, 120),
    requester_email: email,
    requester_role: role,
    type: (b.type === 'bug' ? 'bug' : 'change'),
    title: str(b.title, 200) || description.slice(0, 80),
    description,
    page: str(b.page, 1000),
    context: (b.context && typeof b.context === 'object') ? b.context : {},
    status: 'new',
  };

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/change_requests`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      const t = await res.text();
      console.error('change_requests insert failed:', res.status, t);
      return jsonResponse(500, { error: 'Failed to queue request' });
    }
    const data = await res.json();
    return jsonResponse(200, { ok: true, id: (data && data[0] && data[0].id) || null, role });
  } catch (err) {
    console.error('submit-intake error:', err);
    return jsonResponse(500, { error: 'Failed to queue request' });
  }
};
