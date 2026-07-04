/**
 * auth-visibility.test.js — visitor nav gating + members-only benefit figures.
 *
 * Mike's directive (2026-07-03, WQ-79):
 *  1. Committee-gated nav entries (Minutes, Systems Map, Assessment — the
 *     pages resources.html's own access map marks committee-only) must not
 *     appear for signed-out visitors at ANY nav level (dropdown sub-menus,
 *     member-profile navs, footers). Hide-gated-by-default: the markup ships
 *     hidden; js/auth-visibility.js reveals for signed-in users.
 *  2. player-benefits.html dollar amounts are members-only: visitors see
 *     placeholders + a warm sign-in invitation; signed-in users get the real
 *     figures (carried in data-member-figure). The no-dollar content (how it
 *     works, league contacts) and the public NBRPA membership dues stay open.
 *
 * Authored 2026-07-03 by Dee (Claude Code) with Mike Wolf.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const AUTH_VISIBILITY_JS = fs.readFileSync(path.join(ROOT, 'js/auth-visibility.js'), 'utf8');

function read(page) {
  return fs.readFileSync(path.join(ROOT, page), 'utf8');
}

// Standard-nav pages (mirrors build-nav.mjs ACTIVE_STATE, kept independent).
const STANDARD_PAGES = [
  'index.html', 'community-info.html', 'admin.html', 'admin-changelog.html',
  'admin-recommendations.html', 'bugs.html', 'features.html', 'members.html',
  'subcommittee-chapter-presidents.html', 'subcommittee-membership.html',
  'subcommittee-scholarships.html', 'scholarships-debusschere.html',
  'scholarships-earl-lloyd.html', 'scholarships-hbcu.html',
  'scholarships-member-grants.html', 'transition-services.html',
  'resources.html', 'minutes.html', 'systems-map.html', 'assessment.html',
  'player-benefits.html', 'membership-offerings.html', 'recommendations.html',
  'leslie-johnson-ideas.html', 'purvis-short-recommendations.html',
  'rec-detail.html', 'about.html',
];

const MEMBER_PAGES = fs.readdirSync(path.join(ROOT, 'members'))
  .filter((f) => f.endsWith('.html'))
  .map((f) => path.join('members', f));

// The committee-gated nav targets (root-relative page names).
const GATED_PAGES = ['minutes.html', 'systems-map.html', 'assessment.html'];

// ──────────────────────────────────────────────────────────────────────────────
// 1. The nav partial gates committee entries, hidden by default.
// ──────────────────────────────────────────────────────────────────────────────

describe('Nav partial — committee entries gated, hidden by default', () => {
  const partial = fs.readFileSync(path.join(ROOT, 'partials/nav.html'), 'utf8');
  const doc = new JSDOM(partial).window.document;

  for (const target of GATED_PAGES) {
    test(`partial: ${target} entry carries data-auth-gate and ships hidden`, () => {
      const link = doc.querySelector(`a[href="${target}"][role="menuitem"]`);
      assert.ok(link, `${target} menu item must exist in the partial`);
      const li = link.closest('li');
      assert.ok(li.hasAttribute('data-auth-gate'), `${target} <li> must carry data-auth-gate`);
      assert.strictEqual(li.style.display, 'none', `${target} <li> must ship display:none`);
    });
  }

  for (const open of ['resources.html', 'player-benefits.html', 'membership-offerings.html']) {
    test(`partial: ${open} entry stays public (no gate)`, () => {
      const link = doc.querySelector(`a[href="${open}"][role="menuitem"]`);
      assert.ok(link, `${open} menu item must exist`);
      const li = link.closest('li');
      assert.ok(!li.hasAttribute('data-auth-gate'), `${open} must NOT be auth-gated`);
    });
  }

  test('partial ships the auth-visibility reveal script', () => {
    assert.ok(
      partial.includes('<script src="/js/auth-visibility.js" defer></script>'),
      'partial must include js/auth-visibility.js so every built page can reveal gated items'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. Every standard-nav page carries the gated (hidden) entries + the script.
// ──────────────────────────────────────────────────────────────────────────────

describe('Standard-nav pages — gated entries hidden at every nav level', () => {
  for (const page of STANDARD_PAGES) {
    test(`${page}: committee nav entries gated + reveal script present`, () => {
      const html = read(page);
      const doc = new JSDOM(html).window.document;
      const nav = doc.querySelector('nav');
      const gated = nav.querySelectorAll('li[data-auth-gate]');
      assert.strictEqual(gated.length, GATED_PAGES.length,
        `${page} nav must gate exactly ${GATED_PAGES.length} entries`);
      gated.forEach((li) => {
        assert.strictEqual(li.style.display, 'none', `${page}: gated nav <li> must ship hidden`);
      });
      assert.ok(html.includes('/js/auth-visibility.js'), `${page} must load auth-visibility.js`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Footers: any "Meeting Minutes" footer link is gated and hidden.
// ──────────────────────────────────────────────────────────────────────────────

describe('Footer minutes links gated on every page that has one', () => {
  for (const page of [...STANDARD_PAGES, ...MEMBER_PAGES]) {
    test(`${page}: footer Meeting Minutes link (if present) is gated`, () => {
      const doc = new JSDOM(read(page)).window.document;
      const links = doc.querySelectorAll(
        'footer a[href="minutes.html"], footer a[href="../minutes.html"]'
      );
      links.forEach((a) => {
        assert.ok(a.hasAttribute('data-auth-gate'),
          `${page}: footer minutes link must carry data-auth-gate`);
        assert.strictEqual(a.style.display, 'none',
          `${page}: footer minutes link must ship hidden`);
      });
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Member-profile pages (hand-rolled navs) are gated too.
// ──────────────────────────────────────────────────────────────────────────────

describe('Member-profile pages — hand-rolled navs gated', () => {
  for (const page of MEMBER_PAGES) {
    test(`${page}: gated nav entries hidden + reveal script present`, () => {
      const html = read(page);
      const doc = new JSDOM(html).window.document;
      for (const target of GATED_PAGES) {
        const link = doc.querySelector(`nav a[href="../${target}"][role="menuitem"]`);
        assert.ok(link, `${page}: ../${target} menu item must exist`);
        const li = link.closest('li');
        assert.ok(li.hasAttribute('data-auth-gate'), `${page}: ../${target} must be gated`);
        assert.strictEqual(li.style.display, 'none', `${page}: ../${target} must ship hidden`);
      }
      assert.ok(html.includes('/js/auth-visibility.js'), `${page} must load auth-visibility.js`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. auth-visibility.js behavior (jsdom, stubbed SomaAuth).
// ──────────────────────────────────────────────────────────────────────────────

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const FIXTURE = `
  <!doctype html>
  <body>
    <nav><ul class="nav-links">
      <li data-auth-gate="member" style="display:none;"><a href="minutes.html">Minutes</a></li>
      <li data-auth-gate="member" style="display:none;"><a href="systems-map.html">Systems Map</a></li>
    </ul></nav>
    <div class="member-invite"><p>Sign in to see current benefit amounts</p></div>
    <p>Rate: <span class="member-figure" data-member-figure="$1,000">—</span> per season</p>
    <footer><a href="minutes.html" data-auth-gate="member" style="display:none;">Meeting Minutes</a></footer>
  </body>
`;

async function loadFixture({ session, viaEvent }) {
  const dom = new JSDOM(FIXTURE, {
    url: 'https://legends-membership.netlify.app/player-benefits.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      window.SomaAuth = {
        onAuthStateChange(handler) {
          window._authHandler = handler;
          return window.SomaAuth;
        },
        getSession() {
          // When exercising the event path, getSession stays pending so only
          // the handler drives state; otherwise resolve with the session.
          if (viaEvent) return new Promise(() => {});
          return Promise.resolve({ data: { session } });
        },
      };
    },
  });
  dom.window.eval(AUTH_VISIBILITY_JS);
  await tick();
  if (viaEvent) {
    dom.window._authHandler('INITIAL_SESSION', session);
    await tick();
  }
  await tick();
  return dom;
}

function stateOf(doc) {
  return {
    gated: Array.from(doc.querySelectorAll('[data-auth-gate]')).map((el) => el.style.display),
    figure: doc.querySelector('.member-figure').textContent,
    invite: doc.querySelector('.member-invite').style.display,
  };
}

describe('auth-visibility.js behavior', () => {
  const user = { id: 'u-1', email: 'player@example.com' };

  test('visitor (no session): gated items stay hidden, placeholder + invite intact', async () => {
    const dom = await loadFixture({ session: null, viaEvent: false });
    const s = stateOf(dom.window.document);
    s.gated.forEach((d) => assert.strictEqual(d, 'none'));
    assert.strictEqual(s.figure, '—');
    assert.strictEqual(s.invite, '');
  });

  test('signed-in via getSession(): gated items revealed, real figures, invite hidden', async () => {
    const dom = await loadFixture({ session: { user }, viaEvent: false });
    const s = stateOf(dom.window.document);
    s.gated.forEach((d) => assert.strictEqual(d, ''));
    assert.strictEqual(s.figure, '$1,000');
    assert.strictEqual(s.invite, 'none');
  });

  test('signed-in via INITIAL_SESSION event: same reveal', async () => {
    const dom = await loadFixture({ session: { user }, viaEvent: true });
    const s = stateOf(dom.window.document);
    s.gated.forEach((d) => assert.strictEqual(d, ''));
    assert.strictEqual(s.figure, '$1,000');
    assert.strictEqual(s.invite, 'none');
  });

  test('SIGNED_OUT re-hides gated items and restores placeholders', async () => {
    const dom = await loadFixture({ session: { user }, viaEvent: true });
    dom.window._authHandler('SIGNED_OUT', null);
    await tick();
    const s = stateOf(dom.window.document);
    s.gated.forEach((d) => assert.strictEqual(d, 'none'));
    assert.strictEqual(s.figure, '—');
    assert.strictEqual(s.invite, '');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 6. player-benefits.html — visitors see no benefit dollar amounts.
// ──────────────────────────────────────────────────────────────────────────────

describe('Player Benefits — amounts members-only, structure public', () => {
  const html = read('player-benefits.html');
  const doc = new JSDOM(html).window.document;

  test('visitor-rendered text contains NO benefit dollar amounts (dues excepted)', () => {
    // What a signed-out visitor sees = the document's default text content.
    const text = doc.body.textContent;
    const dollars = (text.match(/\$[\d,.]+(?:\s?million)?(?:\/\w+)?/g) || []);
    const allowed = new Set(['$250/year', '$3,500']); // public NBRPA membership dues
    const leaked = dollars.filter((d) => !allowed.has(d));
    assert.deepStrictEqual(leaked, [], `benefit amounts leaked to visitors: ${leaked.join(', ')}`);
  });

  test('no TBA placeholders remain (replaced by the gated-figure mechanism)', () => {
    assert.ok(!/\bTBA\b/.test(doc.body.textContent), 'TBA placeholders should be gone');
  });

  test('real figures ride data-member-figure for signed-in reveal', () => {
    const figures = Array.from(doc.querySelectorAll('.member-figure[data-member-figure]'))
      .map((el) => el.getAttribute('data-member-figure'));
    // The pre-redaction canon (commit 96a6285b^) — every value must be present.
    const expected = [
      '$1,000', '$10,000/month',                       // NBA pension rate + example
      '$41,667/year', '$125,000', '$24,000',           // tuition reimbursement
      '~$3,000', '~$36,000', '~$5,000', '~$60,000',    // pension table
      '~$8,000', '~$96,000', '~$10,000', '~$120,000',
      '~$15,000', '~$180,000',
      '$30,000', '$50,000', '$100,000',                // WNBA recognition (+$100k prior life ins.)
      '$700,000',                                      // WNBA life insurance
      '$24.5 million', '$3,828',                       // ABA payments
      '$2,500', '$150,000',                            // grants (x2 occurrences)
      '$1 million',                                    // scholarships total
    ];
    for (const value of expected) {
      assert.ok(figures.includes(value), `missing gated figure ${value}`);
    }
    // Every placeholder shows the em-dash to visitors.
    doc.querySelectorAll('.member-figure[data-member-figure]').forEach((el) => {
      assert.strictEqual(el.textContent, '—', 'visitor placeholder must be an em-dash');
    });
  });

  test('warm sign-in invitations present for visitors (top + pension table)', () => {
    const invites = doc.querySelectorAll('.member-invite');
    assert.ok(invites.length >= 2, 'expect the intro invitation and the pension-table invitation');
    const text = Array.from(invites).map((el) => el.textContent).join(' ');
    assert.ok(/free for all former players/i.test(text), 'invitation must carry the warm free-membership line');
    doc.querySelectorAll('.member-invite a[href*="login.html"]').forEach((a) => {
      assert.ok(a.getAttribute('href').includes('redirect'), 'sign-in link should round-trip back to the page');
    });
    assert.ok(doc.querySelector('.member-invite a[href*="login.html"]'), 'invitation must link to sign-in');
  });

  test('public content stays public: league contacts + membership dues untouched', () => {
    const text = doc.body.textContent;
    assert.ok(text.includes('(800) 955-6272'), 'NBPA phone stays public');
    assert.ok(text.includes('1-888-996-1727'), 'ABA hotline stays public');
    assert.ok(text.includes('$250/year'), 'Gold dues stay public');
    assert.ok(text.includes('$3,500'), 'Platinum dues stay public');
  });
});
