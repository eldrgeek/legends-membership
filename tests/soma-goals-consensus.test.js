'use strict';

// Unit tests for the PURE consensus algorithm in js/soma-goals.js.
// Each case uses hand-built mock orderings whose expected result can be
// computed by hand, so the orchestrator can trust the math without real data.
//
// Recap of the algorithm under test (see js/soma-goals.js):
//   - buildMemberRankings: per-member ranking of approved goals; goals a member
//     never placed go LAST for that member; only members with >=1 row count.
//   - pairwiseTally + copelandScores: Copeland order, tie-break by net margin,
//     then mean position, then title.
//   - detectCycles: Condorcet 3-cycles in the "beats" relation.
//   - goalDistributions: 1-based min/Q1/median/Q3/max + per-member positions.
//   - kendallsW: W = 12*S / (m^2 * (n^3 - n)); null when m<2 or n<2.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SOMA_GOALS_JS = fs.readFileSync(path.join(ROOT, 'js/soma-goals.js'), 'utf8');

// Load the IIFE once and grab the exposed pure functions.
const { window } = new JSDOM('', { runScripts: 'outside-only' });
window.eval(SOMA_GOALS_JS);
const C = window.SomaGoals.consensus;

// Arrays returned by the component live in the jsdom realm, so their prototype
// is window.Array, not this realm's Array — assert.deepEqual treats that as a
// mismatch. Compare as plain numbers via a realm-agnostic helper.
function sameNums(actual, expected, msg) {
  assert.equal(actual.length, expected.length, msg);
  for (let i = 0; i < expected.length; i++) assert.equal(actual[i], expected[i], msg);
}

function approved(id, title) {
  return { id: id, group: 'g', title: title, status: 'approved' };
}

// Helper: turn { member: [goalIdInRankOrder...] } into goal_orderings rows.
function rowsFrom(rankings) {
  const out = [];
  Object.keys(rankings).forEach((m) => {
    rankings[m].forEach((gid, i) => {
      out.push({ member_email: m, goal_id: gid, position: i });
    });
  });
  return out;
}

describe('consensus — clear consensus (members nearly agree)', () => {
  // 3 members; almost everyone ranks A > B > C. One member swaps B and C.
  const goals = [approved('A', 'Alpha'), approved('B', 'Bravo'), approved('C', 'Charlie')];
  const rankings = {
    'm1@x.com': ['A', 'B', 'C'],
    'm2@x.com': ['A', 'B', 'C'],
    'm3@x.com': ['A', 'C', 'B'] // small disagreement on B vs C
  };
  const orderings = rowsFrom(rankings);

  test('Copeland order is A, B, C', () => {
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.ok, true);
    assert.equal(model.memberCount, 3);
    sameNums(model.order.map((o) => o.id), ['A', 'B', 'C']);
  });

  test('A beats both, Copeland scores reflect dominance', () => {
    const model = C.computeConsensus(goals, orderings);
    const byId = {};
    model.order.forEach((o) => { byId[o.id] = o; });
    // A above B and C in all 3 → A beats both → Copeland +2.
    assert.equal(byId['A'].copeland, 2);
    // B above C in 2 of 3 → B beats C; loses to A → 0.
    assert.equal(byId['B'].copeland, 0);
    // C loses to A and B → -2.
    assert.equal(byId['C'].copeland, -2);
  });

  test('Kendall W is high (strong agreement)', () => {
    const model = C.computeConsensus(goals, orderings);
    // Hand check: ranks (1-based) per goal across members:
    //   A: 1,1,1 → R=3 ; B: 2,2,3 → R=7 ; C: 3,3,2 → R=8 ; Rbar=6
    //   S = (3-6)^2 + (7-6)^2 + (8-6)^2 = 9+1+4 = 14
    //   W = 12*14 / (3^2 * (27-3)) = 168 / (9*24) = 168/216 = 0.7777...
    assert.ok(Math.abs(model.W - 0.77777777) < 1e-6, 'W ≈ 0.778, got ' + model.W);
    assert.equal(model.wLabel, 'strong');
  });

  test('no cycle in a clear-consensus set', () => {
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.cycles.length, 0);
  });
});

describe('consensus — polarized (two camps)', () => {
  // 4 members split into two camps over A and B, agree C is middle-ish.
  // Camp 1 (2 members): A > B > C   Camp 2 (2 members): B > A > C... but make
  // it cleanly polarized on A vs B with C consistently last-ish so the order is
  // decidable and A/B is a near-tie.
  const goals = [approved('A', 'Alpha'), approved('B', 'Bravo'), approved('C', 'Charlie')];
  const rankings = {
    'm1@x.com': ['A', 'B', 'C'],
    'm2@x.com': ['A', 'C', 'B'],
    'm3@x.com': ['B', 'C', 'A'],
    'm4@x.com': ['B', 'A', 'C']
  };
  const orderings = rowsFrom(rankings);

  test('A vs B is a near-tie → contested adjacent pair flagged', () => {
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.ok, true);
    // votes A>B: m1,m2 = 2 ; votes B>A: m3,m4 = 2 → tie, margin 0 (<=1) → contested.
    const top = model.order[0].id, second = model.order[1].id;
    const contestedPair = model.contested.find((cp) =>
      (cp.aboveId === top && cp.belowId === second));
    assert.ok(contestedPair, 'top adjacent pair should be contested');
    assert.ok(Math.abs(contestedPair.margin) <= 1);
  });

  test('Kendall W is LOW (weak agreement on the split)', () => {
    const model = C.computeConsensus(goals, orderings);
    // Ranks per goal: A: 1,1,3,2 R=7 ; B: 2,3,1,1 R=7 ; C: 3,2,2,3 R=10 ; Rbar=8
    // S = (7-8)^2 + (7-8)^2 + (10-8)^2 = 1+1+4 = 6
    // W = 12*6 / (4^2 * (27-3)) = 72 / (16*24) = 72/384 = 0.1875
    assert.ok(Math.abs(model.W - 0.1875) < 1e-9, 'W = 0.1875, got ' + model.W);
    assert.equal(model.wLabel, 'weak');
  });

  test('a polarized goal has a wide distribution', () => {
    const model = C.computeConsensus(goals, orderings);
    // Goal A positions (1-based): 1,1,3,2 → min 1, max 3 → spread 2 (wide).
    const distA = model.distributions['A'];
    assert.equal(distA.min, 1);
    assert.equal(distA.max, 3);
    assert.ok((distA.max - distA.min) >= 2, 'polarized goal spans widely');
  });
});

describe('consensus — Condorcet cycle (classic A>B>C, B>C>A, C>A>B)', () => {
  const goals = [approved('A', 'Alpha'), approved('B', 'Bravo'), approved('C', 'Charlie')];
  const rankings = {
    'm1@x.com': ['A', 'B', 'C'],
    'm2@x.com': ['B', 'C', 'A'],
    'm3@x.com': ['C', 'A', 'B']
  };
  const orderings = rowsFrom(rankings);

  test('cycle detected', () => {
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.ok, true);
    assert.ok(model.cycles.length >= 1, 'a 3-cycle should be detected');
    // The detected triple should be {A,B,C}.
    const set = new Set(model.cycles[0]);
    assert.equal(set.size, 3);
    ['A', 'B', 'C'].forEach((id) => assert.ok(set.has(id)));
  });

  test('pairwise relation is a perfect rock-paper-scissors loop', () => {
    const pair = C.pairwiseTally(goals, C.buildMemberRankings(goals, orderings));
    // A>B: m1,m3 = 2 ; B>A: m2 = 1 → A beats B.
    assert.ok(pair['A']['B'] > pair['B']['A']);
    // B>C: m1,m2 = 2 ; C>B: m3 = 1 → B beats C.
    assert.ok(pair['B']['C'] > pair['C']['B']);
    // C>A: m2,m3 = 2 ; A>C: m1 = 1 → C beats A.
    assert.ok(pair['C']['A'] > pair['A']['C']);
  });

  test('Kendall W is near 0 (no concordance)', () => {
    const model = C.computeConsensus(goals, orderings);
    // Ranks per goal: each goal gets ranks {1,2,3} once → R=6 for all → S=0 → W=0.
    assert.equal(model.W, 0);
    assert.equal(model.wLabel, 'weak');
  });
});

describe('consensus — distribution / quartile correctness', () => {
  test('median + quartiles on a known small set', () => {
    // 5 members; goal X positions chosen so quartiles are easy to verify.
    // X ranked at 1-based positions: 1,2,3,4,5 across 5 members.
    const goals = [approved('X', 'Ex'), approved('Y', 'Why')];
    const rankings = {
      'm1@x.com': ['X', 'Y'], // X pos 1
      'm2@x.com': ['Y', 'X'], // X pos 2
      'm3@x.com': ['Y', 'X'], // X pos 2 ... we need spread; rebuild explicitly
    };
    // Build a controlled 5-member set for 5 goals so X lands at 1..5.
    const g5 = ['A', 'B', 'C', 'D', 'E'].map((id) => approved(id, id));
    // Member i puts 'A' at position i (0-based), filling the rest in fixed order.
    function rankWithAt(idsRest, aPos) {
      const list = [];
      let restIdx = 0;
      for (let p = 0; p < 5; p++) {
        if (p === aPos) list.push('A');
        else list.push(idsRest[restIdx++]);
      }
      return list;
    }
    const rest = ['B', 'C', 'D', 'E'];
    const r5 = {
      'p1@x.com': rankWithAt(rest, 0), // A at pos 1
      'p2@x.com': rankWithAt(rest, 1), // A at pos 2
      'p3@x.com': rankWithAt(rest, 2), // A at pos 3
      'p4@x.com': rankWithAt(rest, 3), // A at pos 4
      'p5@x.com': rankWithAt(rest, 4)  // A at pos 5
    };
    const orderings = rowsFrom(r5);
    const dist = C.goalDistributions(g5, C.buildMemberRankings(g5, orderings))['A'];
    // Positions (1-based) for A: 1,2,3,4,5.
    sameNums(dist.sorted, [1, 2, 3, 4, 5]);
    assert.equal(dist.min, 1);
    assert.equal(dist.max, 5);
    assert.equal(dist.median, 3);       // middle of 1..5
    assert.equal(dist.q1, 2);           // linear-interp quartile of [1..5]
    assert.equal(dist.q3, 4);
    // keep the unused vars referenced to avoid lint noise
    void goals; void rankings;
  });

  test('missing placement defaults a goal to LAST for that member', () => {
    // Member only placed A and B; C was approved later and never placed → C last.
    const goals = [approved('A', 'A'), approved('B', 'B'), approved('C', 'C')];
    const orderings = [
      { member_email: 'm1@x.com', goal_id: 'A', position: 0 },
      { member_email: 'm1@x.com', goal_id: 'B', position: 1 },
      // no row for C
      { member_email: 'm2@x.com', goal_id: 'A', position: 0 },
      { member_email: 'm2@x.com', goal_id: 'B', position: 1 },
      { member_email: 'm2@x.com', goal_id: 'C', position: 2 }
    ];
    const rankings = C.buildMemberRankings(goals, orderings);
    // m1's C must be last (index 2).
    assert.equal(rankings['m1@x.com'].indexOf('C'), 2);
    const dist = C.goalDistributions(goals, rankings)['C'];
    // C positions (1-based): m1 → 3, m2 → 3.
    sameNums(dist.sorted, [3, 3]);
  });
});

describe('consensus — guards / empty states', () => {
  test('m < 2 returns the empty state (need-members), never throws', () => {
    const goals = [approved('A', 'A'), approved('B', 'B')];
    const orderings = [
      { member_email: 'solo@x.com', goal_id: 'A', position: 0 },
      { member_email: 'solo@x.com', goal_id: 'B', position: 1 }
    ];
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.ok, false);
    assert.equal(model.reason, 'need-members');
    assert.equal(model.memberCount, 1);
    assert.equal(model.W, null);
  });

  test('n < 2 approved goals returns need-goals', () => {
    const goals = [approved('A', 'A'), { id: 'P', group: 'g', title: 'pending', status: 'pending' }];
    const orderings = [
      { member_email: 'm1@x.com', goal_id: 'A', position: 0 },
      { member_email: 'm2@x.com', goal_id: 'A', position: 0 }
    ];
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.ok, false);
    assert.equal(model.reason, 'need-goals');
  });

  test('kendallsW returns null directly when undefined', () => {
    assert.equal(C.kendallsW([approved('A', 'A')], { 'm1@x.com': ['A'] }), null); // n<2
    assert.equal(C.kendallsW([approved('A', 'A'), approved('B', 'B')], { 'm1@x.com': ['A', 'B'] }), null); // m<2
  });

  test('non-approved goals and orphan ordering rows are ignored', () => {
    const goals = [approved('A', 'A'), approved('B', 'B')];
    const orderings = [
      { member_email: 'm1@x.com', goal_id: 'A', position: 0 },
      { member_email: 'm1@x.com', goal_id: 'B', position: 1 },
      { member_email: 'm1@x.com', goal_id: 'ZZZ', position: 2 }, // orphan, not approved
      { member_email: 'm2@x.com', goal_id: 'B', position: 0 },
      { member_email: 'm2@x.com', goal_id: 'A', position: 1 }
    ];
    const model = C.computeConsensus(goals, orderings);
    assert.equal(model.ok, true);
    assert.equal(model.memberCount, 2);
    // Orphan ZZZ never appears in the order.
    sameNums(model.order.map((o) => o.id).sort(), ['A', 'B']);
  });
});
