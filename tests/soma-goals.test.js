'use strict';

const { describe, test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOMA_GOALS_JS = fs.readFileSync(path.join(ROOT, 'js/soma-goals.js'), 'utf8');

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

// A tiny in-memory Supabase-REST mock. Tracks goals + orderings keyed by group
// and applies the same role-gating RLS expresses, so the test exercises the
// component's read filtering AND write paths fully offline.
function makeBackend(opts) {
  opts = opts || {};
  const state = {
    goals: (opts.goals || []).slice(),
    orderings: (opts.orderings || []).slice(),
    missing: !!opts.missing,
    requests: [],
    nextId: 100
  };

  // committeeFor(token) -> boolean. Token is the access_token we pass through.
  const committeeTokens = new Set(opts.committeeTokens || []);

  function fetchImpl(url, init) {
    init = init || {};
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(url);
    const pathname = u.pathname;
    const token = (init.headers && init.headers.Authorization || '').replace('Bearer ', '');
    const isCommittee = committeeTokens.has(token);
    state.requests.push({ method, pathname, body: init.body ? JSON.parse(init.body) : null, token });

    function res(status, data) {
      const text = data == null ? '' : JSON.stringify(data);
      return Promise.resolve({
        ok: status >= 200 && status < 300,
        status,
        text: () => Promise.resolve(text)
      });
    }

    if (state.missing) return res(404, { message: 'relation does not exist' });

    if (pathname === '/rest/v1/goals') {
      if (method === 'GET') {
        const group = u.searchParams.get('group') ? u.searchParams.get('group').replace('eq.', '') : null;
        let rows = state.goals.filter((g) => g.group === group);
        // RLS: anon/non-committee see only approved.
        if (!isCommittee) rows = rows.filter((g) => g.status === 'approved');
        return res(200, rows);
      }
      if (method === 'POST') {
        const body = JSON.parse(init.body);
        const row = Object.assign({ id: 'g' + (state.nextId++), created_at: new Date().toISOString() }, body);
        state.goals.push(row);
        return res(201, [row]);
      }
    }

    if (pathname === '/rest/v1/goals' || pathname.startsWith('/rest/v1/goals')) {
      if (method === 'PATCH') {
        const idEq = u.searchParams.get('id');
        const id = idEq ? idEq.replace('eq.', '') : null;
        const patch = JSON.parse(init.body);
        const row = state.goals.find((g) => g.id === id);
        if (row) Object.assign(row, patch);
        return res(200, row ? [row] : []);
      }
    }

    if (pathname === '/rest/v1/goal_orderings') {
      if (method === 'GET') {
        const group = u.searchParams.get('group') ? u.searchParams.get('group').replace('eq.', '') : null;
        const memberEq = u.searchParams.get('member_email');
        const member = memberEq ? decodeURIComponent(memberEq.replace('eq.', '')) : null;
        const rows = state.orderings.filter((o) => o.group === group && o.member_email === member);
        return res(200, rows);
      }
      if (method === 'POST') {
        const rows = JSON.parse(init.body);
        rows.forEach((r) => {
          const existing = state.orderings.find((o) =>
            o.member_email === r.member_email && o.group === r.group && o.goal_id === r.goal_id);
          if (existing) existing.position = r.position;
          else state.orderings.push(Object.assign({}, r));
        });
        return res(200, null);
      }
    }

    return res(404, { message: 'not found' });
  }

  return { state, fetchImpl, committeeTokens };
}

function buildDom(backend, { session, role } = {}) {
  const dom = new JSDOM(`
    <!doctype html>
    <body>
      <div id="soma-goals" data-group="scholarships"></div>
    </body>
  `, {
    url: 'https://legends-membership.netlify.app/subcommittee-scholarships.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.SOMA_AUTH_CONFIG = { url: 'https://example.supabase.co', anonKey: 'anon-key' };
      window.fetch = (u, init) => backend.fetchImpl(u, init);
      window.SomaAuth = {
        _handler: null,
        onAuthStateChange(handler) { window.SomaAuth._handler = handler; return window.SomaAuth; },
        getSession() { return Promise.resolve({ data: { session: session || null } }); },
        getRole() { return Promise.resolve(role || null); }
      };
    }
  });
  dom.window.eval(SOMA_GOALS_JS);
  return dom;
}

async function loadGoals(backend, ctx) {
  const dom = buildDom(backend, ctx || {});
  await tick(); await tick(); await tick();
  return dom;
}

const COMMITTEE_SESSION = { access_token: 'tok-committee', user: { id: 'u1', email: 'gfos44@gmail.com' } };
const MEMBER_SESSION = { access_token: 'tok-member', user: { id: 'u2', email: 'fan@example.com' } };

describe('SOMA Goals — role detection', () => {
  test('admin email is committee', () => {
    const { window } = new JSDOM('', { runScripts: 'outside-only' });
    global.window = window;
    window.eval(SOMA_GOALS_JS);
    assert.equal(window.SomaGoals.isCommittee({ email: 'mw@mike-wolf.com' }, null), true);
    assert.equal(window.SomaGoals.isCommittee({ email: 'gfos44@gmail.com' }, null), true);
  });
  test("'committee' profile role is committee", () => {
    const { window } = new JSDOM('', { runScripts: 'outside-only' });
    window.eval(SOMA_GOALS_JS);
    assert.equal(window.SomaGoals.isCommittee({ email: 'someone@new.org' }, 'committee'), true);
    assert.equal(window.SomaGoals.isCommittee({ email: 'someone@new.org' }, 'admin'), true);
  });
  test('plain member is not committee', () => {
    const { window } = new JSDOM('', { runScripts: 'outside-only' });
    window.eval(SOMA_GOALS_JS);
    assert.equal(window.SomaGoals.isCommittee({ email: 'fan@example.com' }, 'member'), false);
    assert.equal(window.SomaGoals.isCommittee(null, null), false);
  });
});

describe('SOMA Goals — visibility gating', () => {
  const seed = () => ({
    goals: [
      { id: 'a', group: 'scholarships', title: 'Approved goal', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-01T00:00:00Z' },
      { id: 'b', group: 'scholarships', title: 'Pending goal', status: 'pending', created_by: 'x@y.com', created_at: '2026-01-02T00:00:00Z' }
    ]
  });

  test('non-committee member sees approved but NOT pending', async () => {
    const backend = makeBackend(seed());
    const dom = await loadGoals(backend, { session: MEMBER_SESSION, role: 'member' });
    const doc = dom.window.document;
    assert.match(doc.body.textContent, /Approved goal/);
    assert.doesNotMatch(doc.body.textContent, /Pending goal/);
    assert.equal(doc.querySelectorAll('.sg-approve').length, 0); // no approve button
    dom.window.close();
  });

  test('anonymous visitor sees approved only, no add form', async () => {
    const backend = makeBackend(seed());
    const dom = await loadGoals(backend, { session: null, role: null });
    const doc = dom.window.document;
    assert.match(doc.body.textContent, /Approved goal/);
    assert.doesNotMatch(doc.body.textContent, /Pending goal/);
    assert.equal(doc.querySelectorAll('.sg-add-form').length, 0);
    assert.match(doc.body.textContent, /Sign in to propose/);
    dom.window.close();
  });

  test('committee member sees BOTH approved and pending, with approve buttons', async () => {
    const backend = makeBackend(Object.assign(seed(), { committeeTokens: ['tok-committee'] }));
    const dom = await loadGoals(backend, { session: COMMITTEE_SESSION, role: 'committee' });
    const doc = dom.window.document;
    assert.match(doc.body.textContent, /Approved goal/);
    assert.match(doc.body.textContent, /Pending goal/);
    assert.equal(doc.querySelectorAll('.sg-approve').length, 1); // one pending → one approve btn
    dom.window.close();
  });
});

describe('SOMA Goals — add creates pending', () => {
  test('signed-in member proposing a goal POSTs status=pending attributed to them', async () => {
    const backend = makeBackend({ goals: [], committeeTokens: [] });
    const dom = await loadGoals(backend, { session: MEMBER_SESSION, role: 'member' });
    const doc = dom.window.document;
    const form = doc.querySelector('.sg-add-form');
    assert.ok(form, 'add form present for signed-in user');
    form.querySelector('.sg-add-title').value = 'Raise scholarship fund';
    form.dispatchEvent(new dom.window.Event('submit'));
    await tick(); await tick();

    const posts = backend.state.requests.filter((r) => r.method === 'POST' && r.pathname === '/rest/v1/goals');
    assert.equal(posts.length, 1);
    assert.equal(posts[0].body.status, 'pending');
    assert.equal(posts[0].body.title, 'Raise scholarship fund');
    assert.equal(posts[0].body.created_by, 'fan@example.com');
    assert.equal(posts[0].body.group, 'scholarships');
    dom.window.close();
  });
});

describe('SOMA Goals — approve flips to approved + visible to all', () => {
  test('committee approve PATCHes status=approved; afterwards a member can see it', async () => {
    const backend = makeBackend({
      goals: [{ id: 'p1', group: 'scholarships', title: 'Mentorship program', status: 'pending', created_by: 'x@y.com', created_at: '2026-01-01T00:00:00Z' }],
      committeeTokens: ['tok-committee']
    });
    const dom = await loadGoals(backend, { session: COMMITTEE_SESSION, role: 'committee' });
    const doc = dom.window.document;
    const approveBtn = doc.querySelector('.sg-approve');
    assert.ok(approveBtn, 'approve button visible to committee');
    approveBtn.click();
    await tick(); await tick(); await tick();

    const patches = backend.state.requests.filter((r) => r.method === 'PATCH');
    assert.equal(patches.length, 1);
    assert.equal(patches[0].body.status, 'approved');
    assert.equal(patches[0].body.approved_by, 'gfos44@gmail.com');
    // Backend now holds it as approved → visible to everyone.
    assert.equal(backend.state.goals[0].status, 'approved');
    dom.window.close();

    // A plain member loads fresh and now sees the (now-approved) goal.
    const backend2 = makeBackend({ goals: backend.state.goals, committeeTokens: ['tok-committee'] });
    const dom2 = await loadGoals(backend2, { session: MEMBER_SESSION, role: 'member' });
    assert.match(dom2.window.document.body.textContent, /Mentorship program/);
    dom2.window.close();
  });
});

describe('SOMA Goals — per-member ordering persists', () => {
  test('committee reorder saves rows keyed by member_email + group', async () => {
    const backend = makeBackend({
      goals: [
        { id: 'g1', group: 'scholarships', title: 'Goal One', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-01T00:00:00Z' },
        { id: 'g2', group: 'scholarships', title: 'Goal Two', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-02T00:00:00Z' }
      ],
      committeeTokens: ['tok-committee']
    });
    const dom = await loadGoals(backend, { session: COMMITTEE_SESSION, role: 'committee' });
    const inst = dom.window.SomaGoals._instances[0];

    // Simulate a drag that reverses the order, then persist from DOM.
    const list = dom.window.document.querySelector('.sg-list');
    const items = list.querySelectorAll('.sg-item.sg-approved');
    list.insertBefore(items[1], items[0]); // move g2 above g1
    inst.persistOrderFromDom();
    await tick(); await tick();

    const posts = backend.state.requests.filter((r) => r.method === 'POST' && r.pathname === '/rest/v1/goal_orderings');
    assert.equal(posts.length, 1);
    const rows = posts[0].body;
    assert.equal(rows.length, 2);
    rows.forEach((r) => {
      assert.equal(r.member_email, 'gfos44@gmail.com');
      assert.equal(r.group, 'scholarships');
    });
    // g2 should now be position 0, g1 position 1.
    const byGoal = {};
    rows.forEach((r) => { byGoal[r.goal_id] = r.position; });
    assert.equal(byGoal['g2'], 0);
    assert.equal(byGoal['g1'], 1);

    // Saved into backend → another load by the SAME member reflects their order.
    assert.equal(backend.state.orderings.length, 2);
    dom.window.close();

    const dom2 = await loadGoals(backend, { session: COMMITTEE_SESSION, role: 'committee' });
    const renderedTitles = Array.prototype.map.call(
      dom2.window.document.querySelectorAll('.sg-item.sg-approved .sg-title'),
      (el) => el.textContent.replace(/\s+/g, ' ').trim()
    );
    assert.equal(renderedTitles[0], 'Goal Two');
    assert.equal(renderedTitles[1], 'Goal One');
    dom2.window.close();
  });

  test('a different member starts with their OWN (empty) ordering, not the first member\'s', async () => {
    const backend = makeBackend({
      goals: [
        { id: 'g1', group: 'scholarships', title: 'Goal One', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-01T00:00:00Z' },
        { id: 'g2', group: 'scholarships', title: 'Goal Two', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-02T00:00:00Z' }
      ],
      orderings: [
        { member_email: 'gfos44@gmail.com', group: 'scholarships', goal_id: 'g2', position: 0 },
        { member_email: 'gfos44@gmail.com', group: 'scholarships', goal_id: 'g1', position: 1 }
      ],
      committeeTokens: ['tok-committee', 'tok-other']
    });
    const OTHER = { access_token: 'tok-other', user: { id: 'u9', email: 'majorjjones@yahoo.com' } };
    const dom = await loadGoals(backend, { session: OTHER, role: 'committee' });
    // Other member has no saved order → default created_at order (Goal One first).
    const titles = Array.prototype.map.call(
      dom.window.document.querySelectorAll('.sg-item.sg-approved .sg-title'),
      (el) => el.textContent.replace(/\s+/g, ' ').trim()
    );
    assert.equal(titles[0], 'Goal One');
    assert.equal(titles[1], 'Goal Two');
    dom.window.close();
  });
});

describe('SOMA Goals — graceful degradation', () => {
  test('missing table shows empty state, does not throw', async () => {
    const backend = makeBackend({ missing: true });
    const dom = await loadGoals(backend, { session: MEMBER_SESSION, role: 'member' });
    const doc = dom.window.document;
    assert.match(doc.body.textContent, /No goals yet/);
    dom.window.close();
  });
});

// Regression: the Change Log review preview loads pages into an iframe whose
// auth client shares storage with the parent, so Supabase fires SIGNED_IN /
// INITIAL_SESSION / TOKEN_REFRESHED repeatedly for the SAME user. Each event
// used to re-fetch + re-render the goals widget, making the iframe flash
// continuously. The widget must render once per identity and ignore redundant
// events. We assert the goals read happens exactly once across a storm.
describe('SOMA Goals — no flashing on redundant auth events', () => {
  function goalsGets(backend) {
    return backend.state.requests.filter(
      (r) => r.method === 'GET' && r.pathname === '/rest/v1/goals'
    ).length;
  }

  test('repeated same-user auth events do not re-render (single goals read)', async () => {
    const backend = makeBackend({
      goals: [
        { id: 'g1', group: 'scholarships', title: 'Goal One', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-01T00:00:00Z' }
      ],
      committeeTokens: ['tok-committee']
    });
    const dom = await loadGoals(backend, { session: COMMITTEE_SESSION, role: 'committee' });
    assert.equal(goalsGets(backend), 1, 'initial mount reads goals once');

    // Simulate the cross-frame / token-refresh event storm for the same user.
    const fire = dom.window.SomaAuth._handler;
    fire('SIGNED_IN', COMMITTEE_SESSION);
    fire('INITIAL_SESSION', COMMITTEE_SESSION);
    fire('TOKEN_REFRESHED', COMMITTEE_SESSION);
    fire('SIGNED_IN', COMMITTEE_SESSION);
    await tick(); await tick(); await tick();

    assert.equal(goalsGets(backend), 1, 'redundant same-user events trigger no extra reads/renders');
    dom.window.close();
  });

  test('a genuine identity change still re-renders', async () => {
    const backend = makeBackend({
      goals: [
        { id: 'g1', group: 'scholarships', title: 'Goal One', status: 'approved', created_by: 'x@y.com', created_at: '2026-01-01T00:00:00Z' }
      ],
      committeeTokens: ['tok-committee']
    });
    const dom = await loadGoals(backend, { session: COMMITTEE_SESSION, role: 'committee' });
    assert.equal(goalsGets(backend), 1);

    const OTHER = { access_token: 'tok-other', user: { id: 'u9', email: 'fan@example.com' } };
    dom.window.SomaAuth.getRole = () => Promise.resolve('member');
    dom.window.SomaAuth._handler('SIGNED_IN', OTHER);
    await tick(); await tick(); await tick();

    assert.equal(goalsGets(backend), 2, 'a different user re-reads/re-renders');
    dom.window.close();
  });
});
