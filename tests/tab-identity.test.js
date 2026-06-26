'use strict';
/*
 * Unit tests for the tab-aware identity storage adapter embedded in
 * js/soma-auth.js (exposed as window.SomaTabIdentity.createTabAwareStorage).
 *
 * We load soma-auth.js inside a vm with a minimal `window` stub (no
 * window.supabase, so SomaAuth.init never runs) and drive the adapter with
 * simulated localStorage (shared across tabs) + per-tab sessionStorage.
 *
 * Run: node tests/tab-identity.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const AUTH_KEY = 'sb-omfwcodoimjmbrhssvfl-auth-token';
const VERIFIER_KEY = 'sb-omfwcodoimjmbrhssvfl-auth-token-code-verifier';

let passed = 0, failed = 0;
function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error('  ✗ FAIL: ' + msg); }
}
function eq(a, b, msg) { assert(a === b, msg + ` (got ${JSON.stringify(a)}, want ${JSON.stringify(b)})`); }

// ── Simulated storage ──────────────────────────────────────────────────────
// A localStorage shared by all tabs that emits storage events to OTHER tabs.
function makeSharedLocalStorage() {
  const data = new Map();
  const listeners = []; // { tabId, fn }
  const api = {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v, fromTab) => {
      const old = data.has(k) ? data.get(k) : null;
      data.set(k, String(v));
      emit(k, String(v), old, fromTab);
    },
    removeItem: (k, fromTab) => {
      const old = data.has(k) ? data.get(k) : null;
      data.delete(k);
      emit(k, null, old, fromTab);
    },
    _register: (tabId, fn) => listeners.push({ tabId, fn }),
    _dump: () => Object.fromEntries(data),
  };
  function emit(key, newValue, oldValue, fromTab) {
    listeners.forEach((l) => {
      if (l.tabId === fromTab) return; // storage events don't fire in the writing tab
      l.fn({ key, newValue, oldValue });
    });
  }
  return api;
}

function makeSessionStorage() {
  const data = new Map();
  return {
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k),
    _dump: () => Object.fromEntries(data),
  };
}

// Load createTabAwareStorage from the real source file.
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'soma-auth.js'), 'utf8');
const sandbox = { window: {}, console, setTimeout, clearTimeout };
sandbox.window.addEventListener = () => {};
vm.runInNewContext(src, sandbox);
const createTabAwareStorage = sandbox.window.SomaTabIdentity.createTabAwareStorage;
assert(typeof createTabAwareStorage === 'function', 'factory is exported');

// A shared clock so TTL pruning is deterministic.
const clock = { t: 1_000_000, now() { return this.t; } };

// Build a "tab": its own sessionStorage + storage-event wiring into the shared LS.
let tabSeq = 0;
function openTab(sharedLS) {
  const tabId = 'tab' + (++tabSeq);
  const ss = makeSessionStorage();
  let storageListener = null;
  const env = {
    localStorage: {
      getItem: (k) => sharedLS.getItem(k),
      setItem: (k, v) => sharedLS.setItem(k, v, tabId),
      removeItem: (k) => sharedLS.removeItem(k, tabId),
    },
    sessionStorage: ss,
    crypto: { randomUUID: () => tabId + '-uuid' },
    Date: clock,
    setInterval: () => 0,
    addEventListener: (type, fn) => { if (type === 'storage') storageListener = fn; },
  };
  const adapter = createTabAwareStorage(env);
  sharedLS._register(tabId, (e) => { if (storageListener) storageListener(e); });
  return { tabId, adapter, ss };
}

function session(userId) {
  return JSON.stringify({ access_token: 'tok-' + userId, user: { id: userId } });
}
function identityInLS(sharedLS) {
  const v = sharedLS.getItem(AUTH_KEY);
  if (!v) return null;
  return JSON.parse(v).user.id;
}

// ── Scenario 1: single tab login persists to localStorage ───────────────────
console.log('Scenario 1: single tab → persists to localStorage');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A'));
  eq(identityInLS(LS), 'A', 'sole tab persists identity A to localStorage');
  eq(JSON.parse(t1.adapter.getItem(AUTH_KEY)).user.id, 'A', 'tab1 reads A');
}

// ── Scenario 2: new tab seeds from localStorage ─────────────────────────────
console.log('Scenario 2: new tab seeds session from localStorage');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A')); // LS = A
  const t2 = openTab(LS);
  eq(JSON.parse(t2.adapter.getItem(AUTH_KEY)).user.id, 'A', 'fresh tab2 seeds A from localStorage');
  eq(t2.ss.getItem(AUTH_KEY) != null, true, 'seed copied into tab2 sessionStorage');
}

// ── Scenario 3: Mike's bug — second tab different identity must NOT clobber ──
console.log("Scenario 3: two tabs, different identities → localStorage frozen, tab1 unaffected");
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A')); // sole tab → LS = A
  const t2 = openTab(LS);                      // seeds A
  t2.adapter.getItem(AUTH_KEY);                // trigger seed + identity detection
  t2.adapter.setItem(AUTH_KEY, session('B'));  // log in as B in tab2

  eq(identityInLS(LS), 'A', 'localStorage stays A under conflict (not clobbered by B)');
  eq(JSON.parse(t2.adapter.getItem(AUTH_KEY)).user.id, 'B', 'tab2 sees its own identity B (sessionStorage)');
  eq(JSON.parse(t1.adapter.getItem(AUTH_KEY)).user.id, 'A', 'tab1 still sees A — identity not changed by tab2');

  // tab1 token refresh under conflict also stays out of localStorage (symmetric)
  t1.adapter.setItem(AUTH_KEY, session('A')); // refreshed A'
  eq(identityInLS(LS), 'A', 'localStorage remains frozen during conflict even on tab1 refresh');
}

// ── Scenario 4: conflict resolves when one tab closes ───────────────────────
console.log('Scenario 4: after the conflicting tab times out, lone tab persists again');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A'));
  const t2 = openTab(LS);
  t2.adapter.getItem(AUTH_KEY);
  t2.adapter.setItem(AUTH_KEY, session('B')); // conflict, LS frozen at A
  eq(identityInLS(LS), 'A', 'frozen at A during conflict');

  // tab2 goes away: advance clock past TTL so its heartbeat entry is stale.
  clock.t += 60_000;
  t1.adapter.setItem(AUTH_KEY, session('A')); // tab1 now effectively alone
  eq(identityInLS(LS), 'A', 'lone tab1 persists A again (no live conflict)');

  // And if tab1 were B now, it would write through:
  t1.adapter.setItem(AUTH_KEY, session('A2'));
  eq(JSON.parse(LS.getItem(AUTH_KEY)).user.id, 'A2', 'write-through resumes after conflict clears');
}

// ── Scenario 5: two tabs SAME identity → persists (token refresh shared) ─────
console.log('Scenario 5: two tabs, same identity → writes persist to localStorage');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A'));
  const t2 = openTab(LS);
  t2.adapter.getItem(AUTH_KEY); // seeds A → tab2 identity is A too
  t2.adapter.setItem(AUTH_KEY, session('A')); // same identity refresh
  eq(identityInLS(LS), 'A', 'same-identity tabs persist to localStorage');
  // storage event should have propagated refreshed token into tab1's sessionStorage
  eq(t1.ss.getItem(AUTH_KEY) != null, true, 'tab1 sessionStorage updated by same-identity refresh');
}

// ── Scenario 6: sign-out under conflict does not clear the other identity ────
console.log('Scenario 6: sign-out under conflict leaves localStorage intact');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A')); // LS = A
  const t2 = openTab(LS);
  t2.adapter.getItem(AUTH_KEY);
  t2.adapter.setItem(AUTH_KEY, session('B')); // conflict
  t2.adapter.removeItem(AUTH_KEY);            // tab2 signs out
  eq(identityInLS(LS), 'A', "tab2 sign-out does not wipe tab1's persisted identity A");
  eq(t2.adapter.getItem(AUTH_KEY) == null || JSON.parse(t2.adapter.getItem(AUTH_KEY)).user.id !== 'B',
     true, 'tab2 session is cleared locally');
}

// ── Scenario 7: sole tab sign-out clears localStorage ───────────────────────
console.log('Scenario 7: sole tab sign-out clears localStorage');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A'));
  t1.adapter.removeItem(AUTH_KEY);
  eq(LS.getItem(AUTH_KEY), null, 'sole tab sign-out removes token from localStorage');
}

// ── Scenario 8: PKCE code-verifier is not mistaken for an identity ──────────
console.log('Scenario 8: code-verifier key is not treated as the identity token');
{
  const LS = makeSharedLocalStorage();
  const t1 = openTab(LS);
  t1.adapter.setItem(AUTH_KEY, session('A'));   // identity A
  t1.adapter.setItem(VERIFIER_KEY, 'random-verifier-string'); // must not clear identity
  t1.adapter.setItem(AUTH_KEY, session('A'));   // refresh A — sole tab, should persist
  eq(identityInLS(LS), 'A', 'identity A preserved across code-verifier writes');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
