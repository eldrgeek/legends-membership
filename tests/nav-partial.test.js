/**
 * nav-partial.test.js — nav single-source-of-truth guard.
 *
 * The site nav is centralized in `partials/nav.html` and inlined into every
 * standard-nav page by `scripts/build-nav.mjs`. This suite turns nav drift into
 * a failing test: if any page's inlined nav diverges from what the build script
 * would generate, `npm test` fails. Re-run `node scripts/build-nav.mjs` to fix.
 *
 * Also asserts (via jsdom) that the inlined nav still satisfies the selectors
 * Bill's tour and the auth logic depend on, and that per-page active state is
 * applied correctly.
 *
 * Run: npm test
 *
 * Authored by Mike Wolf with Claude (Opus 4.8), 2026-06-26.
 */

'use strict';

const { test, describe, before } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');

// The build script is ESM; load it dynamically.
let buildMod;
before(async () => {
  buildMod = await import(
    url.pathToFileURL(path.join(ROOT, 'scripts', 'build-nav.mjs')).href
  );
});

// Standard-nav pages and their expected active item. Mirrors build-nav.mjs but
// kept here independently so the test is a real check, not a tautology.
const PAGES = {
  'index.html': null,
  'community-info.html': null,
  'admin.html': null,
  'admin-changelog.html': null,
  'admin-recommendations.html': null,
  'bugs.html': null,
  'features.html': null,
  'members.html': { dropdown: 'members.html' },
  'subcommittee-chapter-presidents.html': { dropdown: 'members.html' },
  'subcommittee-membership.html': { dropdown: 'members.html' },
  'subcommittee-scholarships.html': { dropdown: 'members.html' },
  'transition-services.html': { dropdown: 'members.html' },
  'resources.html': { dropdown: 'resources.html' },
  'minutes.html': { dropdown: 'resources.html' },
  'systems-map.html': { dropdown: 'resources.html' },
  'assessment.html': { dropdown: 'resources.html' },
  'player-benefits.html': { dropdown: 'resources.html' },
  'membership-offerings.html': { dropdown: 'resources.html' },
  'recommendations.html': { link: 'recommendations.html' },
  'leslie-johnson-ideas.html': { link: 'recommendations.html' },
  'rec-detail.html': { link: 'recommendations.html' },
  'about.html': { link: 'about.html' },
};

const PAGE_NAMES = Object.keys(PAGES);

// Pages whose nav is intentionally different and must be left alone.
const SKIP_PAGES = ['community-chat.html', 'community-video.html'];

function read(page) {
  return fs.readFileSync(path.join(ROOT, page), 'utf8');
}

function navRegion(html) {
  const m = html.match(
    /<!-- BEGIN nav \(generated from partials\/nav\.html — do not edit inline\) -->[\s\S]*?<!-- END nav -->/
  );
  return m ? m[0] : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Drift guard: running the build produces no diff.
// ──────────────────────────────────────────────────────────────────────────────

describe('Nav single source of truth — no drift', () => {
  for (const page of PAGE_NAMES) {
    test(`${page}: inlined nav matches build output (no drift)`, () => {
      const html = read(page);
      const rebuilt = buildMod.injectNav(html, page);
      assert.strictEqual(
        rebuilt,
        html,
        `${page} nav is out of date — run \`node scripts/build-nav.mjs\` to regenerate`
      );
    });
  }

  test('build --check reports no drift across the whole site', () => {
    const results = buildMod.buildAll({ check: true });
    const drifted = results.filter((r) => r.status === 'drift').map((r) => r.page);
    assert.deepStrictEqual(
      drifted,
      [],
      `Nav drift in: ${drifted.join(', ')} — run \`node scripts/build-nav.mjs\``
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Every standard-nav page carries the generated marker region.
// ──────────────────────────────────────────────────────────────────────────────

describe('Nav markers present on every standard-nav page', () => {
  for (const page of PAGE_NAMES) {
    test(`${page}: has BEGIN/END nav markers`, () => {
      assert.ok(navRegion(read(page)), `${page} must carry the generated nav region`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Genuinely-different navs are left untouched (no markers forced onto them).
// ──────────────────────────────────────────────────────────────────────────────

describe('Genuinely-different navs are left alone', () => {
  for (const page of SKIP_PAGES) {
    test(`${page}: keeps its stripped community nav (no standard-nav markers)`, () => {
      const html = read(page);
      assert.strictEqual(
        navRegion(html),
        null,
        `${page} must NOT be overwritten with the standard nav`
      );
      // Sanity: it still has its own community items and not the Committee dropdown.
      assert.ok(
        html.includes('community-info.html'),
        `${page} should retain its community nav links`
      );
      assert.ok(
        !html.includes('nav-dropdown-toggle'),
        `${page} should not gain the standard dropdown nav`
      );
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Selectors Bill's tour + auth logic depend on still resolve (jsdom).
// ──────────────────────────────────────────────────────────────────────────────

describe('Inlined nav preserves required selectors', () => {
  const REQUIRED_SELECTORS = [
    '.nav-inner',
    '.nav-links',
    '.nav-dropdown',
    '.nav-dropdown-menu',
    '.nav-dropdown-toggle',
    'a[href="members.html"]',
    'a[href="resources.html"]',
    '#ask-bill-nav',
    '#login-nav',
    '#nav-admin-link',
    '#auth-nav',
    '#auth-name',
  ];

  for (const page of PAGE_NAMES) {
    test(`${page}: all tour/auth selectors resolve`, () => {
      const doc = new JSDOM(read(page)).window.document;
      for (const sel of REQUIRED_SELECTORS) {
        assert.ok(
          doc.querySelector(sel),
          `${page} must keep selector ${sel} resolvable`
        );
      }
    });
  }

  test('Resources dropdown toggle, with Documents as its first item', () => {
    const doc = new JSDOM(read('resources.html')).window.document;
    const toggle = doc.querySelector('a[href="resources.html"].nav-dropdown-toggle');
    assert.ok(toggle, 'Resources dropdown toggle must exist');
    assert.ok(
      toggle.textContent.includes('Resources'),
      'The dropdown TOGGLE label must be "Resources"'
    );
    const firstItem = doc.querySelector('a[href="resources.html"][role="menuitem"]');
    assert.ok(firstItem, 'Documents menu item must exist');
    assert.ok(
      firstItem.textContent.includes('Documents'),
      'The first dropdown ITEM must be "Documents"'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Per-page active state is correct.
// ──────────────────────────────────────────────────────────────────────────────

describe('Per-page active state', () => {
  for (const [page, active] of Object.entries(PAGES)) {
    test(`${page}: active state is correct`, () => {
      const doc = new JSDOM(read(page)).window.document;
      const nav = doc.querySelector('nav');
      const activeEls = Array.from(nav.querySelectorAll('.active'));

      if (!active) {
        assert.strictEqual(
          activeEls.length,
          0,
          `${page} should have no active nav item`
        );
        return;
      }

      assert.strictEqual(activeEls.length, 1, `${page} should have exactly one active nav item`);
      const el = activeEls[0];

      if (active.dropdown) {
        assert.ok(
          el.classList.contains('nav-dropdown-toggle'),
          `${page} active item should be the dropdown toggle`
        );
        assert.strictEqual(
          el.getAttribute('href'),
          active.dropdown,
          `${page} active dropdown toggle should point to ${active.dropdown}`
        );
      } else if (active.link) {
        assert.strictEqual(
          el.getAttribute('href'),
          active.link,
          `${page} active link should point to ${active.link}`
        );
      }
    });
  }
});
