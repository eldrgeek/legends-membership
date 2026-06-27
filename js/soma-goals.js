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

  // ── Consensus algorithm (pure, testable) ────────────────────────────────────
  // These functions take APPROVED goals and the raw goal_orderings rows for a
  // group and aggregate every committee member's personal ordering into ONE
  // group ordering, plus an agreement summary. No DOM, no network — see
  // tests/soma-goals-consensus.test.js for the hand-checked cases.
  //
  // Vocabulary:
  //   goals     : [{ id, title, ... }] the approved goals (any order)
  //   orderings : [{ member_email, goal_id, position }] raw rows for the group
  //   ranking   : for one member, their goal ids ordered best→worst (index = rank)
  //
  // Rule for "missing" placements: if a member never placed a now-approved goal
  // (it was added after they last ranked), that goal is treated as ranked LAST
  // for that member. Only members with >=1 ordering row for the group count.

  // Build { member_email: [goalId, goalId, ...] } where each list is that
  // member's ranking of ALL approved goals (best first). Goals the member never
  // placed go to the bottom, in the goals[] input order (stable) among themselves.
  function buildMemberRankings(goals, orderings) {
    var goalIds = goals.map(function (g) { return String(g.id); });
    var goalIdSet = {};
    goalIds.forEach(function (id) { goalIdSet[id] = true; });

    // member -> { goalId: position }
    var byMember = {};
    (orderings || []).forEach(function (row) {
      if (!row) return;
      var m = row.member_email;
      var gid = String(row.goal_id);
      if (!m || !goalIdSet[gid]) return; // ignore orderings for non-approved goals
      if (!byMember[m]) byMember[m] = {};
      byMember[m][gid] = Number(row.position);
    });

    var rankings = {};
    Object.keys(byMember).forEach(function (m) {
      var pos = byMember[m];
      // Sort approved goals: placed ones by their saved position; unplaced ones
      // last, preserving goals[] order via their index.
      var BIG = 1e9;
      var ordered = goalIds.slice().sort(function (a, b) {
        var pa = pos.hasOwnProperty(a) ? pos[a] : BIG + goalIds.indexOf(a);
        var pb = pos.hasOwnProperty(b) ? pos[b] : BIG + goalIds.indexOf(b);
        return pa - pb;
      });
      rankings[m] = ordered;
    });
    return rankings; // members with NO rows are absent → excluded automatically
  }

  // Given member rankings, return { rankOf: { member: { goalId: rankIndex } } }
  // where rankIndex is 0-based (0 = top priority).
  function rankIndexMap(rankings) {
    var out = {};
    Object.keys(rankings).forEach(function (m) {
      var map = {};
      rankings[m].forEach(function (gid, i) { map[gid] = i; });
      out[m] = map;
    });
    return out;
  }

  // Pairwise tallies. For each unordered pair {A,B} among approved goals, count
  // how many counted members rank A above B vs B above A. Returns a lookup
  // pair[A][B] = number of members ranking A above B.
  function pairwiseTally(goals, rankings) {
    var ids = goals.map(function (g) { return String(g.id); });
    var ranks = rankIndexMap(rankings);
    var members = Object.keys(ranks);
    var pair = {};
    ids.forEach(function (a) { pair[a] = {}; ids.forEach(function (b) { if (a !== b) pair[a][b] = 0; }); });
    members.forEach(function (m) {
      var rm = ranks[m];
      for (var i = 0; i < ids.length; i++) {
        for (var j = i + 1; j < ids.length; j++) {
          var a = ids[i], b = ids[j];
          if (rm[a] < rm[b]) pair[a][b]++;
          else if (rm[b] < rm[a]) pair[b][a]++;
        }
      }
    });
    return pair;
  }

  // Mean 0-based position of each goal across counted members.
  function meanPositions(goals, rankings) {
    var ranks = rankIndexMap(rankings);
    var members = Object.keys(ranks);
    var out = {};
    goals.forEach(function (g) {
      var id = String(g.id);
      var sum = 0;
      members.forEach(function (m) { sum += ranks[m][id]; });
      out[id] = members.length ? sum / members.length : 0;
    });
    return out;
  }

  // Copeland scores + net margins. score(A) = (#A beats) - (#beats A); A beats B
  // iff votes_AB > votes_BA. netMargin(A) = sum over opponents of (AB - BA).
  function copelandScores(goals, pair) {
    var ids = goals.map(function (g) { return String(g.id); });
    var score = {}, net = {};
    ids.forEach(function (a) {
      var s = 0, n = 0;
      ids.forEach(function (b) {
        if (a === b) return;
        var ab = pair[a][b], ba = pair[b][a];
        if (ab > ba) s += 1; else if (ba > ab) s -= 1;
        n += (ab - ba);
      });
      score[a] = s; net[a] = n;
    });
    return { score: score, net: net };
  }

  // Detect any Condorcet 3-cycle (A beats B, B beats C, C beats A) in the strict
  // "beats" relation. Best-effort triple scan; returns an array of cycles, each
  // [idA, idB, idC] (empty if none). N is small so O(n^3) is fine.
  function detectCycles(goals, pair) {
    var ids = goals.map(function (g) { return String(g.id); });
    function beats(a, b) { return pair[a][b] > pair[b][a]; }
    var cycles = [];
    for (var i = 0; i < ids.length; i++) {
      for (var j = 0; j < ids.length; j++) {
        for (var k = 0; k < ids.length; k++) {
          if (i === j || j === k || i === k) continue;
          var a = ids[i], b = ids[j], c = ids[k];
          // Canonical: only record each unordered triple once (i<j, i<k).
          if (!(i < j && i < k)) continue;
          if (beats(a, b) && beats(b, c) && beats(c, a)) cycles.push([a, b, c]);
          else if (beats(a, c) && beats(c, b) && beats(b, a)) cycles.push([a, c, b]);
        }
      }
    }
    return cycles;
  }

  // Per-goal position distribution across counted members. Positions are 1-based
  // here (rank 0 → position 1) so the UI track reads "1..n".
  function quantile(sorted, q) {
    if (!sorted.length) return null;
    if (sorted.length === 1) return sorted[0];
    var pos = (sorted.length - 1) * q;
    var lo = Math.floor(pos), hi = Math.ceil(pos);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
  }
  function goalDistributions(goals, rankings) {
    var ranks = rankIndexMap(rankings);
    var members = Object.keys(ranks);
    var out = {};
    goals.forEach(function (g) {
      var id = String(g.id);
      var positions = members.map(function (m) { return ranks[m][id] + 1; }); // 1-based
      var sorted = positions.slice().sort(function (a, b) { return a - b; });
      out[id] = {
        positions: positions,           // per-member, member-order (for dots)
        sorted: sorted,
        min: sorted.length ? sorted[0] : null,
        q1: quantile(sorted, 0.25),
        median: quantile(sorted, 0.5),
        q3: quantile(sorted, 0.75),
        max: sorted.length ? sorted[sorted.length - 1] : null
      };
    });
    return out;
  }

  // Kendall's W (coefficient of concordance) over m rankings of n goals.
  // Uses 1-based ranks. W = 12*S / (m^2 * (n^3 - n)), where R_i = sum of goal i's
  // ranks across members, Rbar = mean R_i, S = sum_i (R_i - Rbar)^2.
  // Returns null when undefined (m < 2 or n < 2). Range [0,1].
  function kendallsW(goals, rankings) {
    var ranks = rankIndexMap(rankings);
    var members = Object.keys(ranks);
    var m = members.length;
    var n = goals.length;
    if (m < 2 || n < 2) return null;
    var R = goals.map(function (g) {
      var id = String(g.id);
      var sum = 0;
      members.forEach(function (mm) { sum += (ranks[mm][id] + 1); }); // 1-based
      return sum;
    });
    var Rbar = R.reduce(function (a, b) { return a + b; }, 0) / n;
    var S = R.reduce(function (a, r) { return a + (r - Rbar) * (r - Rbar); }, 0);
    var denom = (m * m) * (n * n * n - n);
    if (denom === 0) return null;
    var W = (12 * S) / denom;
    // Clamp tiny FP overshoot.
    if (W < 0) W = 0; if (W > 1) W = 1;
    return W;
  }

  function wLabel(W) {
    if (W == null) return 'n/a';
    if (W >= 0.7) return 'strong';
    if (W >= 0.4) return 'moderate';
    return 'weak';
  }

  // Top-level: compute the full consensus model for a group.
  // Returns { ok, memberCount, order, distributions, W, wLabel, contested, cycles }
  //   order        : [{ id, title, copeland, net, meanPos }] in consensus order
  //   distributions: { goalId: {min,q1,median,q3,max,positions,sorted} }
  //   contested    : [{ aboveId, belowId, margin }] for ADJACENT pairs (margin<=1)
  //   cycles       : array of 3-cycles as [idA,idB,idC] (title lookup done in UI)
  // ok=false with reason when there is not enough data (m<2 or n<2).
  function computeConsensus(goals, orderings) {
    var approved = (goals || []).filter(function (g) { return g && g.status === 'approved'; });
    var rankings = buildMemberRankings(approved, orderings);
    var memberCount = Object.keys(rankings).length;
    if (memberCount < 2 || approved.length < 2) {
      return { ok: false, reason: memberCount < 2 ? 'need-members' : 'need-goals', memberCount: memberCount, order: [], distributions: {}, W: null, wLabel: 'n/a', contested: [], cycles: [] };
    }

    var pair = pairwiseTally(approved, rankings);
    var cope = copelandScores(approved, pair);
    var means = meanPositions(approved, rankings);
    var titleById = {};
    approved.forEach(function (g) { titleById[String(g.id)] = g.title || ''; });

    var orderIds = approved.map(function (g) { return String(g.id); }).sort(function (a, b) {
      if (cope.score[b] !== cope.score[a]) return cope.score[b] - cope.score[a];
      if (cope.net[b] !== cope.net[a]) return cope.net[b] - cope.net[a];
      if (means[a] !== means[b]) return means[a] - means[b];
      return String(titleById[a]).localeCompare(String(titleById[b]));
    });

    var order = orderIds.map(function (id) {
      return { id: id, title: titleById[id], copeland: cope.score[id], net: cope.net[id], meanPos: means[id] };
    });

    // Contested adjacent pairs: margin = votes(above over below) - votes(below over above).
    var contested = [];
    for (var i = 0; i < orderIds.length - 1; i++) {
      var a = orderIds[i], b = orderIds[i + 1];
      var margin = pair[a][b] - pair[b][a];
      if (margin <= 1) {
        contested.push({ aboveId: a, belowId: b, margin: margin, votesAbove: pair[a][b], votesBelow: pair[b][a] });
      }
    }

    var distributions = goalDistributions(approved, rankings);
    var W = kendallsW(approved, rankings);
    var cycles = detectCycles(approved, pair);

    return {
      ok: true,
      memberCount: memberCount,
      order: order,
      distributions: distributions,
      W: W,
      wLabel: wLabel(W),
      contested: contested,
      cycles: cycles,
      titleById: titleById
    };
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
    this.allOrderings = [];   // raw goal_orderings rows (ALL committee members) for consensus
    this.consensusError = false; // true if the all-member read failed
    this.view = 'mine';       // 'mine' (drag) | 'consensus' — committee only
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

  // Load EVERY committee member's ordering rows for this group (RLS lets
  // committee members SELECT all rows). Used to compute the consensus view.
  // Degrades quietly: on any failure we flag consensusError and leave the list
  // empty so the consensus view shows a calm message instead of throwing.
  GoalsInstance.prototype.loadAllOrderings = function () {
    var self = this;
    self.allOrderings = [];
    self.consensusError = false;
    if (!self.committee) return Promise.resolve();
    var q = '/rest/v1/goal_orderings?select=member_email,goal_id,position'
      + '&group=eq.' + encodeURIComponent(self.group);
    return supaRest(q, { method: 'GET' }, self.token()).then(function (res) {
      if (!res.ok || !Array.isArray(res.data)) { self.consensusError = true; return; }
      self.allOrderings = res.data;
    }).catch(function () { self.consensusError = true; });
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

    // Committee-only toggle between the personal drag order and the consensus
    // view. Non-committee users never see this and never see consensus markup.
    if (self.committee) {
      html.push(
        '<div class="sg-view-toggle" role="tablist" aria-label="Goals view">',
        '  <button type="button" class="sg-view-btn' + (self.view === 'mine' ? ' is-active' : '') + '" data-view="mine" role="tab" aria-selected="' + (self.view === 'mine') + '">My order</button>',
        '  <button type="button" class="sg-view-btn' + (self.view === 'consensus' ? ' is-active' : '') + '" data-view="consensus" role="tab" aria-selected="' + (self.view === 'consensus') + '">Consensus</button>',
        '</div>'
      );
    }

    if (self.committee && self.view === 'consensus') {
      html.push(self.consensusHtml());
      html.push('</div>');
      self.root.innerHTML = html.join('');
      self.wire();
      return;
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

  // ── Consensus view markup (committee-only) ──────────────────────────────────
  // Renders the aggregated ordering with a per-goal distribution band. Pure
  // string building off computeConsensus(); never throws. Degrades to a calm
  // message on edge/empty/error states.
  GoalsInstance.prototype.consensusHtml = function () {
    var self = this;
    if (self.consensusError) {
      return '<div class="sg-empty sg-consensus-empty">Consensus is unavailable right now. Try again shortly.</div>';
    }
    var model;
    try {
      model = computeConsensus(self.goals, self.allOrderings);
    } catch (e) {
      return '<div class="sg-empty sg-consensus-empty">Consensus is unavailable right now.</div>';
    }

    if (!model.ok) {
      var msg = model.reason === 'need-goals'
        ? 'Consensus needs at least two approved goals to compare.'
        : 'Consensus needs at least two committee members to have ranked these goals.';
      return '<div class="sg-empty sg-consensus-empty">' + esc(msg) + '</div>';
    }

    var n = model.order.length;
    var pct = function (p) { return ((p - 1) / (n - 1)) * 100; }; // pos 1..n → 0..100%

    var out = ['<div class="sg-consensus">'];

    // Headline.
    var wStr = model.W == null ? '—' : model.W.toFixed(2);
    out.push(
      '<div class="sg-consensus-head">',
      '  <div class="sg-w-headline">Committee alignment: <strong>W = ' + esc(wStr) + '</strong> ' +
        '<span class="sg-w-label sg-w-' + esc(model.wLabel) + '">' + esc(model.wLabel) + '</span></div>',
      '  <div class="sg-consensus-sub">Based on ' + model.memberCount + ' member' + (model.memberCount === 1 ? '' : 's') + '&rsquo; rankings of ' + n + ' approved goal' + (n === 1 ? '' : 's') + '.</div>',
      '</div>'
    );

    // Cycle note (best-effort).
    if (model.cycles && model.cycles.length) {
      var c = model.cycles[0];
      var names = c.map(function (id) { return esc((model.titleById[id] || '').slice(0, 40)); });
      out.push(
        '<div class="sg-cycle-note">Members disagree in a loop here: ' +
        names.join(' &rarr; ') + ' &rarr; ' + names[0] +
        (model.cycles.length > 1 ? ' (and ' + (model.cycles.length - 1) + ' more)' : '') +
        '. No single ordering fully satisfies everyone.</div>'
      );
    }

    // Track scale labels (1 .. n).
    out.push(
      '<div class="sg-scale" aria-hidden="true"><span>Top priority (1)</span><span>Lowest (' + n + ')</span></div>'
    );

    // Contested lookup keyed by the index gap it sits in.
    var contestedByAbove = {};
    (model.contested || []).forEach(function (cp) { contestedByAbove[cp.aboveId] = cp; });

    out.push('<ol class="sg-consensus-list">');
    model.order.forEach(function (row, idx) {
      var dist = model.distributions[row.id] || {};
      var boxLeft = (dist.q1 != null) ? pct(dist.q1) : 0;
      var boxRight = (dist.q3 != null) ? pct(dist.q3) : 0;
      var boxWidth = Math.max(0, boxRight - boxLeft);
      var medianLeft = (dist.median != null) ? pct(dist.median) : 0;
      var spread = (dist.max != null && dist.min != null) ? (dist.max - dist.min) : 0;
      var tight = spread <= 1;

      out.push(
        '<li class="sg-consensus-item' + (tight ? ' sg-agreed' : ' sg-split') + '" data-id="' + esc(row.id) + '">',
        '  <div class="sg-consensus-row">',
        '    <span class="sg-rank">' + (idx + 1) + '</span>',
        '    <div class="sg-consensus-main">',
        '      <div class="sg-consensus-title">' + esc(row.title) + '</div>',
        '      <div class="sg-band" title="Box = middle half (Q1&ndash;Q3); line = median; dots = each member">'
      );
      // The Q1–Q3 box.
      out.push(
        '        <div class="sg-band-track"></div>',
        '        <div class="sg-band-box" style="left:' + boxLeft.toFixed(2) + '%;width:' + boxWidth.toFixed(2) + '%"></div>',
        '        <div class="sg-band-median" style="left:' + medianLeft.toFixed(2) + '%"></div>'
      );
      // Member dots, stacked vertically when they share a position.
      var seen = {};
      (dist.positions || []).forEach(function (p) {
        var key = String(p);
        var stack = seen[key] || 0;
        seen[key] = stack + 1;
        var left = pct(p);
        var bottom = 50 + stack * 6; // px-ish offset via translate
        out.push('<span class="sg-band-dot" style="left:' + left.toFixed(2) + '%;transform:translate(-50%,' + (-(stack * 7)) + 'px)"></span>');
      });
      out.push(
        '      </div>',
        '    </div>',
        '  </div>'
      );
      // Contested divider beneath this row, if the pair below is a near-tie.
      var cp = contestedByAbove[row.id];
      if (cp && idx < model.order.length - 1) {
        out.push(
          '  <div class="sg-contested"><span>close call (' + cp.votesAbove + '&ndash;' + cp.votesBelow + ')</span></div>'
        );
      }
      out.push('</li>');
    });
    out.push('</ol>');
    out.push('</div>');
    return out.join('');
  };

  GoalsInstance.prototype.wire = function () {
    var self = this;

    // View toggle (committee only).
    Array.prototype.forEach.call(self.root.querySelectorAll('.sg-view-btn'), function (btn) {
      btn.addEventListener('click', function () {
        var v = btn.getAttribute('data-view');
        if (v && v !== self.view) { self.view = v; self.render(); }
      });
    });

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
      .then(function () { return self.loadAllOrderings(); })
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
    committeeEmails: COMMITTEE_EMAILS.slice(),
    // Pure consensus algorithm (exposed for tests + ad-hoc inspection).
    consensus: {
      computeConsensus: computeConsensus,
      buildMemberRankings: buildMemberRankings,
      pairwiseTally: pairwiseTally,
      copelandScores: copelandScores,
      detectCycles: detectCycles,
      goalDistributions: goalDistributions,
      kendallsW: kendallsW,
      wLabel: wLabel,
      meanPositions: meanPositions
    },
    // Browser verification helper: force a mounted instance into the consensus
    // view using injected mock orderings, so the orchestrator can see it render
    // on a live page without real committee data. Example:
    //   SomaGoals.injectConsensus([
    //     { member_email: 'a@x.com', goal_id: '<approvedGoalId>', position: 0 },
    //     { member_email: 'a@x.com', goal_id: '<otherGoalId>',   position: 1 },
    //     { member_email: 'b@x.com', goal_id: '<approvedGoalId>', position: 1 },
    //     { member_email: 'b@x.com', goal_id: '<otherGoalId>',   position: 0 }
    //   ]);
    // Forces committee=true on the first instance, swaps in the rows, switches to
    // the consensus view and re-renders. Returns the computed model for inspection.
    injectConsensus: function (orderings, idx) {
      var inst = instances[idx || 0];
      if (!inst) return null;
      inst.committee = true;
      inst.consensusError = false;
      inst.allOrderings = orderings || [];
      inst.view = 'consensus';
      inst.render();
      try { return computeConsensus(inst.goals, inst.allOrderings); } catch (e) { return null; }
    }
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoMount);
    } else {
      autoMount();
    }
  }
})(typeof window !== 'undefined' ? window : this);
