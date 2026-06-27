/* SOMA Goals — reusable, embeddable goals component
 * ===================================================================
 * A drop-in goals list for any subcommittee/page. Anyone signed in can
 * PROPOSE a goal (it starts 'pending'); committee members see pending goals,
 * APPROVE them (approved goals become visible to everyone), and reorder goals
 * by drag-and-drop into THEIR OWN personal priority order (saved per member).
 *
 * ── Embed (site-specific bits come from the page, not from this core file) ──
 *
 *   <!-- in <head> -->
 *   <link rel="stylesheet" href="/css/soma-goals.css">
 *
 *   <!-- where you want the list; data-group is the page's scope key -->
 *   <div id="soma-goals" data-group="scholarships"></div>
 *
 *   <!-- after soma-auth.js is loaded -->
 *   <script src="/js/soma-goals.js"></script>
 *
 * The component auto-initializes every element matching [data-group] inside
 * (or equal to) #soma-goals. You can also mount manually:
 *   SomaGoals.mount(document.getElementById('soma-goals'));
 *
 * Backed by public.goals + public.goal_orderings (see migrations/goals.sql).
 * If those tables don't exist yet, the component shows a quiet empty state
 * instead of throwing — it never breaks the host page.
 * ===================================================================
 */
(function (global) {
  'use strict';

  // Committee detection mirrors js/community-nav.js so the whole site agrees on
  // who is "committee". Admins ARE committee members. The 'committee' profile
  // role is being added in a sibling change; we accept both 'admin' and
  // 'committee'. The email allowlists are a bootstrap fallback for owners whose
  // profiles.role may not be seeded yet — RLS on the server still gates writes.
  var ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];
  var COMMITTEE_EMAILS = [
    'gfos44@gmail.com',
    'majorjjones@yahoo.com',
    'lihollins14@gmail.com',
    'capersb23@gmail.com',
    'datrotter4@gmail.com',
    'ladybarkley@yahoo.com',
    'gtinsley@pengeo.com',
    'wdavis5455@yahoo.com',
    'mo@elos360.com',
    'purvis.short@icloud.com'
  ];

  function cleanEmail(user) {
    return ((user && user.email) || '').toLowerCase();
  }

  // Returns true when the signed-in user counts as a committee member.
  // role is the Supabase profiles.role ('admin' | 'committee' | 'member' | null).
  function isCommittee(user, role) {
    var email = cleanEmail(user);
    if (!email) return false;
    if (role === 'admin' || role === 'committee') return true;
    if (ADMIN_EMAILS.indexOf(email) !== -1) return true;
    if (COMMITTEE_EMAILS.indexOf(email) !== -1) return true;
    return false;
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch];
    });
  }

  // ── Supabase REST helper (anon key + the user's session token) ──────────────
  // Mirrors admin.html's supaRest. Works for both signed-in and anonymous reads
  // (anonymous gets only approved goals, per RLS). Resolves to
  // { ok, status, data } and NEVER rejects on HTTP errors — callers branch on
  // status so a missing table (400/404/422) degrades gracefully.
  function supaRest(path, opts, accessToken) {
    var cfg = global.SOMA_AUTH_CONFIG || {};
    if (!cfg.url || !cfg.anonKey) {
      return Promise.resolve({ ok: false, status: 0, data: null });
    }
    var headers = Object.assign({
      'apikey': cfg.anonKey,
      'Content-Type': 'application/json'
    }, (opts && opts.headers) || {});
    if (accessToken) headers['Authorization'] = 'Bearer ' + accessToken;
    return fetch(cfg.url + path, Object.assign({}, opts || {}, { headers: headers }))
      .then(function (res) {
        return res.text().then(function (text) {
          var data = null;
          try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
          return { ok: res.ok, status: res.status, data: data };
        });
      })
      .catch(function () {
        return { ok: false, status: 0, data: null };
      });
  }

  // Supabase / PostgREST returns these when a table or relation is absent.
  function isMissingTable(result) {
    return !result.ok && (result.status === 400 || result.status === 404 || result.status === 422 || result.status === 0);
  }

  // ── One mounted instance ────────────────────────────────────────────────────
  function GoalsInstance(root) {
    this.root = root;
    this.group = root.getAttribute('data-group') || 'default';
    this.session = null;
    this.user = null;
    this.role = null;
    this.committee = false;
    this.goals = [];
    this.orderingById = {};   // goal_id -> position (this member's saved order)
    this.dragId = null;
  }

  GoalsInstance.prototype.token = function () {
    return this.session && this.session.access_token;
  };
  GoalsInstance.prototype.email = function () {
    return this.user && this.user.email;
  };

  // Apply the member's saved per-member ordering to approved goals; pending
  // goals (committee-only) sort after approved by created_at.
  GoalsInstance.prototype.sortedGoals = function () {
    var self = this;
    var BIG = 1e9;
    return this.goals.slice().sort(function (a, b) {
      // Pending always after approved.
      if (a.status !== b.status) return a.status === 'approved' ? -1 : 1;
      if (a.status === 'approved' && self.committee) {
        var pa = self.orderingById.hasOwnProperty(a.id) ? self.orderingById[a.id] : BIG;
        var pb = self.orderingById.hasOwnProperty(b.id) ? self.orderingById[b.id] : BIG;
        if (pa !== pb) return pa - pb;
      }
      // Default order: created_at ascending.
      return new Date(a.created_at || 0) - new Date(b.created_at || 0);
    });
  };

  GoalsInstance.prototype.loadGoals = function () {
    var self = this;
    // RLS decides what comes back: anon/non-committee get only 'approved';
    // committee members additionally get 'pending'. We don't filter by status
    // in the query so committee members see both.
    var q = '/rest/v1/goals?select=id,title,description,created_by,created_at,status,approved_by,approved_at'
      + '&group=eq.' + encodeURIComponent(self.group)
      + '&order=created_at.asc';
    return supaRest(q, { method: 'GET' }, self.token()).then(function (res) {
      if (isMissingTable(res)) { self.goals = []; self.missing = true; return; }
      self.missing = false;
      self.goals = Array.isArray(res.data) ? res.data : [];
    });
  };

  GoalsInstance.prototype.loadOrdering = function () {
    var self = this;
    self.orderingById = {};
    if (!self.committee || !self.email()) return Promise.resolve();
    var q = '/rest/v1/goal_orderings?select=goal_id,position'
      + '&group=eq.' + encodeURIComponent(self.group)
      + '&member_email=eq.' + encodeURIComponent(self.email());
    return supaRest(q, { method: 'GET' }, self.token()).then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) return;
      res.data.forEach(function (row) { self.orderingById[row.goal_id] = row.position; });
    });
  };

  GoalsInstance.prototype.addGoal = function (title, description) {
    var self = this;
    var body = {
      group: self.group,
      title: title,
      description: description || null,
      created_by: self.email(),
      status: 'pending'
    };
    return supaRest('/rest/v1/goals', {
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(body)
    }, self.token());
  };

  GoalsInstance.prototype.approveGoal = function (goal) {
    var self = this;
    var patch = {
      status: 'approved',
      approved_by: self.email(),
      approved_at: new Date().toISOString()
    };
    return supaRest('/rest/v1/goals?id=eq.' + encodeURIComponent(goal.id), {
      method: 'PATCH',
      headers: { 'Prefer': 'return=representation' },
      body: JSON.stringify(patch)
    }, self.token());
  };

  // Persist this member's ordering for the approved goals currently shown.
  // Upsert on (member_email, group, goal_id) so re-saves overwrite.
  GoalsInstance.prototype.saveOrdering = function (orderedApprovedIds) {
    var self = this;
    if (!self.committee || !self.email()) return Promise.resolve({ ok: false, status: 0 });
    var rows = orderedApprovedIds.map(function (id, i) {
      return { member_email: self.email(), group: self.group, goal_id: id, position: i, updated_at: new Date().toISOString() };
    });
    if (!rows.length) return Promise.resolve({ ok: true, status: 200, data: [] });
    return supaRest('/rest/v1/goal_orderings?on_conflict=member_email,group,goal_id', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify(rows)
    }, self.token());
  };

  // ── Rendering ───────────────────────────────────────────────────────────────
  GoalsInstance.prototype.render = function () {
    var self = this;
    var sorted = self.sortedGoals();
    var html = ['<div class="soma-goals">'];

    // Add-goal form: any signed-in user can propose.
    if (self.user) {
      html.push(
        '<form class="sg-add-form">',
        '  <input type="text" class="sg-add-title" maxlength="200" placeholder="Propose a goal…" required>',
        '  <textarea class="sg-add-desc" maxlength="4000" placeholder="Add detail (optional)" rows="2"></textarea>',
        '  <button type="submit" class="sg-add-btn">Propose Goal</button>',
        '  <span class="sg-add-status"></span>',
        '</form>'
      );
    } else {
      html.push('<p class="sg-signin-note">Sign in to propose a goal.</p>');
    }

    if (!sorted.length) {
      html.push('<div class="sg-empty">No goals yet.' + (self.user ? ' Be the first to propose one.' : '') + '</div>');
    } else {
      html.push('<ul class="sg-list">');
      sorted.forEach(function (g) {
        var approved = g.status === 'approved';
        var draggable = self.committee && approved;
        html.push(
          '<li class="sg-item' + (approved ? ' sg-approved' : ' sg-pending') + '"' +
            ' data-id="' + esc(g.id) + '"' +
            (draggable ? ' draggable="true"' : '') + '>',
          draggable ? '<span class="sg-handle" aria-hidden="true">⋮⋮</span>' : '',
          '<div class="sg-body">',
          '  <div class="sg-title">' + esc(g.title) +
            (approved ? '' : '<span class="sg-badge">Pending</span>') + '</div>',
          g.description ? '  <div class="sg-desc">' + esc(g.description) + '</div>' : '',
          '  <div class="sg-meta">Proposed by ' + esc((g.created_by || '').split('@')[0]) + '</div>',
          '</div>',
          (self.committee && !approved
            ? '<button class="sg-approve" data-id="' + esc(g.id) + '">Approve</button>'
            : ''),
          '</li>'
        );
      });
      html.push('</ul>');
    }

    html.push('</div>');
    self.root.innerHTML = html.join('');
    self.wire();
  };

  GoalsInstance.prototype.wire = function () {
    var self = this;
    var form = self.root.querySelector('.sg-add-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var titleEl = form.querySelector('.sg-add-title');
        var descEl = form.querySelector('.sg-add-desc');
        var statusEl = form.querySelector('.sg-add-status');
        var btn = form.querySelector('.sg-add-btn');
        var title = (titleEl.value || '').trim();
        if (!title) return;
        btn.disabled = true;
        statusEl.textContent = 'Saving…';
        statusEl.className = 'sg-add-status';
        self.addGoal(title, (descEl.value || '').trim()).then(function (res) {
          btn.disabled = false;
          if (res.ok) {
            titleEl.value = '';
            descEl.value = '';
            statusEl.textContent = '';
            self.refresh();
          } else {
            statusEl.textContent = isMissingTable(res)
              ? 'Goals are not enabled yet.'
              : 'Could not save (status ' + res.status + ').';
            statusEl.className = 'sg-add-status err';
          }
        });
      });
    }

    Array.prototype.forEach.call(self.root.querySelectorAll('.sg-approve'), function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-id');
        var goal = self.goals.filter(function (g) { return g.id === id; })[0];
        if (!goal) return;
        btn.disabled = true;
        btn.textContent = '…';
        self.approveGoal(goal).then(function (res) {
          if (res.ok) { self.refresh(); }
          else { btn.disabled = false; btn.textContent = 'Approve'; }
        });
      });
    });

    if (self.committee) self.wireDragDrop();
  };

  GoalsInstance.prototype.wireDragDrop = function () {
    var self = this;
    var list = self.root.querySelector('.sg-list');
    if (!list) return;

    Array.prototype.forEach.call(list.querySelectorAll('.sg-item[draggable="true"]'), function (item) {
      item.addEventListener('dragstart', function (e) {
        self.dragId = item.getAttribute('data-id');
        item.classList.add('sg-dragging');
        if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; }
      });
      item.addEventListener('dragend', function () {
        item.classList.remove('sg-dragging');
        self.dragId = null;
      });
      item.addEventListener('dragover', function (e) {
        e.preventDefault();
        var dragging = list.querySelector('.sg-dragging');
        if (!dragging || dragging === item) return;
        var rect = item.getBoundingClientRect();
        var after = (e.clientY - rect.top) > rect.height / 2;
        if (after) item.parentNode.insertBefore(dragging, item.nextSibling);
        else item.parentNode.insertBefore(dragging, item);
      });
      item.addEventListener('drop', function (e) {
        e.preventDefault();
        self.persistOrderFromDom();
      });
    });
  };

  // Read the current DOM order of approved items and save it for this member.
  GoalsInstance.prototype.persistOrderFromDom = function () {
    var self = this;
    var list = self.root.querySelector('.sg-list');
    if (!list) return;
    var ids = [];
    Array.prototype.forEach.call(list.querySelectorAll('.sg-item.sg-approved'), function (item) {
      ids.push(item.getAttribute('data-id'));
    });
    // Optimistically update local map so re-renders keep the new order.
    ids.forEach(function (id, i) { self.orderingById[id] = i; });
    self.saveOrdering(ids);
  };

  GoalsInstance.prototype.refresh = function () {
    var self = this;
    return self.loadGoals()
      .then(function () { return self.loadOrdering(); })
      .then(function () { self.render(); })
      .catch(function () { self.render(); });
  };

  GoalsInstance.prototype.start = function (session, role) {
    var self = this;
    self.session = session || null;
    self.user = session ? session.user : null;
    self.role = role || null;
    self.committee = isCommittee(self.user, self.role);
    return self.refresh();
  };

  // ── Public API ──────────────────────────────────────────────────────────────
  var instances = [];

  function mount(root) {
    if (!root || root.__somaGoals) return null;
    var inst = new GoalsInstance(root);
    root.__somaGoals = inst;
    instances.push(inst);

    var Auth = global.SomaAuth;
    if (!Auth) {
      // No auth available — show world-readable (approved) goals anonymously.
      inst.start(null, null);
      return inst;
    }

    function go(session) {
      if (!session || !session.user) { inst.start(null, null); return; }
      Auth.getRole(session.user).then(function (role) {
        inst.start(session, role);
      }).catch(function () { inst.start(session, null); });
    }

    try {
      Auth.onAuthStateChange(function (event, session) {
        if (event === 'SIGNED_OUT') { inst.start(null, null); return; }
        if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') go(session);
      });
    } catch (e) {}

    // Also kick once immediately in case auth already settled.
    if (Auth.getSession) {
      Auth.getSession().then(function (res) {
        go(res && res.data ? res.data.session : null);
      }).catch(function () { inst.start(null, null); });
    }
    return inst;
  }

  function autoMount() {
    // Mount #soma-goals if it carries data-group, plus any [data-group] inside it.
    var primary = document.getElementById('soma-goals');
    if (primary && primary.hasAttribute('data-group')) mount(primary);
    Array.prototype.forEach.call(document.querySelectorAll('#soma-goals [data-group], .soma-goals-mount[data-group]'), mount);
  }

  global.SomaGoals = {
    mount: mount,
    isCommittee: isCommittee,
    _instances: instances,
    _supaRest: supaRest,
    _GoalsInstance: GoalsInstance,
    adminEmails: ADMIN_EMAILS.slice(),
    committeeEmails: COMMITTEE_EMAILS.slice()
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoMount);
    } else {
      autoMount();
    }
  }
})(typeof window !== 'undefined' ? window : this);
