const { createClient } = require('@supabase/supabase-js');

const ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
const BUCKET = 'site-config';
const SETTINGS_FILE = 'resource-visibility.json';

const DEFAULT_SETTINGS = {
  resources: { label: 'Resources', href: 'resources.html', visibility: 'committee-only' },
  minutes: { label: 'Minutes', href: 'minutes.html', visibility: 'committee-only' },
  'systems-map': { label: 'Systems Map', href: 'systems-map.html', visibility: 'committee-only' },
  assessment: { label: 'Assessment', href: 'assessment.html', visibility: 'committee-only' },
  'player-benefits': { label: 'Player Benefits', href: 'player-benefits.html', visibility: 'open' }
};

exports.handler = async function(event) {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers };

  const svcKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!svcKey) {
    return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
  }

  const url = process.env.SUPABASE_URL || 'https://omfwcodoimjmbrhssvfl.supabase.co';
  const svc = createClient(url, svcKey, { auth: { persistSession: false } });

  if (event.httpMethod === 'GET') {
    try {
      const { data, error } = await svc.storage.from(BUCKET).download(SETTINGS_FILE);
      if (error || !data) return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
      const text = await data.text();
      return { statusCode: 200, headers, body: text };
    } catch (e) {
      return { statusCode: 200, headers, body: JSON.stringify(DEFAULT_SETTINGS) };
    }
  }

  if (event.httpMethod === 'POST') {
    const authHeader = (event.headers || {}).authorization || (event.headers || {}).Authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Unauthorized' }) };

    const { data: { user }, error: authErr } = await svc.auth.getUser(token);
    if (authErr || !user) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };

    const { data: profile } = await svc.from('profiles').select('role').eq('id', user.id).single();
    const admin = (profile && profile.role === 'admin') || ADMIN_EMAILS.includes(user.email);
    if (!admin) return { statusCode: 403, headers, body: JSON.stringify({ error: 'Forbidden' }) };

    let newSettings;
    try {
      newSettings = JSON.parse(event.body || '{}');
    } catch (e) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid JSON' }) };
    }

    for (const [key, val] of Object.entries(newSettings)) {
      if (!val || !['open', 'committee-only'].includes(val.visibility)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Invalid visibility for ' + key }) };
      }
    }

    await svc.storage.createBucket(BUCKET, { public: false }).catch(() => {});

    const buf = Buffer.from(JSON.stringify(newSettings, null, 2), 'utf8');
    const { error: uploadErr } = await svc.storage
      .from(BUCKET)
      .upload(SETTINGS_FILE, buf, { upsert: true, contentType: 'application/json' });

    if (uploadErr) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Save failed: ' + uploadErr.message }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, settings: newSettings }) };
  }

  return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
};
