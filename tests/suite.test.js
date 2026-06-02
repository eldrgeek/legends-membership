/**
 * Legends Membership Site — Regression Test Suite
 *
 * Tests auth UI behavior by parsing HTML files with jsdom and simulating
 * the signed-in / signed-out updateAuthUI logic inline.
 *
 * Strategy: parse each page's HTML into DOM (no script execution),
 * then apply the updateAuthUI logic ourselves using the same element IDs
 * the page code uses. This avoids needing a real browser or network.
 *
 * Run: npm test
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const ADMIN_EMAILS = ['mw@mike-wolf.com', 'gfos44@gmail.com'];

/**
 * Parse an HTML file into a jsdom DOM without executing any scripts.
 * This gives us a queryable DOM that matches exactly what the page HTML
 * declares, then we apply the auth logic ourselves.
 */
function parsePage(filename) {
  const html = fs.readFileSync(path.join(ROOT, filename), 'utf8');
  // runScripts: false — we don't need or want script execution
  const dom = new JSDOM(html);
  return dom;
}

/**
 * Apply the standard auth UI logic to a parsed DOM.
 * Mirrors what updateAuthUI / updateAuthNav does on each page.
 */
function applyAuth(dom, user) {
  const doc = dom.window.document;
  const authNav    = doc.getElementById('auth-nav');
  const loginNav   = doc.getElementById('login-nav');
  const navAdmin   = doc.getElementById('nav-admin-link');
  const footerAdmin = doc.getElementById('footer-admin-link');
  const nm          = doc.getElementById('auth-name');

  if (user) {
    const name = (user.user_metadata && user.user_metadata.full_name) || user.email;
    if (nm) nm.textContent = name;
    if (authNav)    authNav.style.display    = 'flex';
    if (loginNav)   loginNav.style.display   = 'none';
    if (navAdmin)   navAdmin.style.display   =
      ADMIN_EMAILS.indexOf(user.email) !== -1 ? 'list-item' : 'none';
    if (footerAdmin) footerAdmin.style.display =
      ADMIN_EMAILS.indexOf(user.email) !== -1 ? 'block' : 'none';
  } else {
    if (authNav)    authNav.style.display    = 'none';
    if (loginNav)   loginNav.style.display   = '';
    if (navAdmin)   navAdmin.style.display   = 'none';
    if (footerAdmin) footerAdmin.style.display = 'none';
  }
}

/** Fake users */
const ANON = null;
const REGULAR_USER = {
  email: 'member@example.com',
  user_metadata: { full_name: 'Test Member' },
};
const ADMIN_USER = {
  email: 'gfos44@gmail.com',
  user_metadata: { full_name: 'Greg Foster' },
};

// Pages to test for the standard auth nav pattern
const NAV_PAGES = [
  'index.html',
  'about.html',
  'members.html',
  'minutes.html',
  'resources.html',
  'systems-map.html',
  'assessment.html',
  'bugs.html',
  'features.html',
  'recommendations.html',
  'rec-detail.html',
  'admin.html',
  'admin-recommendations.html',
];

// ──────────────────────────────────────────────────────────────────────────────
// Task 1: Login link hidden when signed-in, visible when signed-out
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 1 — Login nav link visibility', () => {
  for (const page of NAV_PAGES) {
    test(`${page}: #login-nav element exists`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('login-nav');
      assert.ok(el, `#login-nav must exist on ${page}`);
    });

    test(`${page}: login-nav hidden when signed in`, () => {
      const dom = parsePage(page);
      applyAuth(dom, REGULAR_USER);
      const loginNav = dom.window.document.getElementById('login-nav');
      assert.ok(loginNav, `#login-nav must exist on ${page}`);
      assert.strictEqual(loginNav.style.display, 'none',
        `login-nav should be hidden when signed in on ${page}`);
    });

    test(`${page}: login-nav not hidden when signed out`, () => {
      const dom = parsePage(page);
      applyAuth(dom, ANON);
      const loginNav = dom.window.document.getElementById('login-nav');
      assert.ok(loginNav, `#login-nav must exist on ${page}`);
      assert.notStrictEqual(loginNav.style.display, 'none',
        `login-nav should be visible when signed out on ${page}`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 1b: Sign Out button visible when signed in
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 1b — Sign Out (auth-nav) visibility', () => {
  for (const page of NAV_PAGES) {
    test(`${page}: #auth-nav element exists`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('auth-nav');
      assert.ok(el, `#auth-nav must exist on ${page}`);
    });

    test(`${page}: auth-nav visible when signed in`, () => {
      const dom = parsePage(page);
      applyAuth(dom, REGULAR_USER);
      const authNav = dom.window.document.getElementById('auth-nav');
      assert.ok(authNav, `#auth-nav must exist on ${page}`);
      assert.notStrictEqual(authNav.style.display, 'none',
        `auth-nav should be visible when signed in on ${page}`);
    });

    test(`${page}: auth-nav hidden when signed out`, () => {
      const dom = parsePage(page);
      applyAuth(dom, ANON);
      const authNav = dom.window.document.getElementById('auth-nav');
      assert.ok(authNav, `#auth-nav must exist on ${page}`);
      assert.strictEqual(authNav.style.display, 'none',
        `auth-nav should be hidden when signed out on ${page}`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 2: Admin nav link visible only for ADMIN_EMAILS
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 2 — Admin nav link gating', () => {
  for (const page of NAV_PAGES) {
    test(`${page}: #nav-admin-link element exists`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('nav-admin-link');
      assert.ok(el, `#nav-admin-link must exist on ${page}`);
    });

    test(`${page}: nav-admin-link hidden when signed out`, () => {
      const dom = parsePage(page);
      applyAuth(dom, ANON);
      const navAdmin = dom.window.document.getElementById('nav-admin-link');
      assert.ok(navAdmin, `#nav-admin-link must exist on ${page}`);
      assert.strictEqual(navAdmin.style.display, 'none',
        `nav-admin-link should be hidden when signed out on ${page}`);
    });

    test(`${page}: nav-admin-link hidden for non-admin`, () => {
      const dom = parsePage(page);
      applyAuth(dom, REGULAR_USER);
      const navAdmin = dom.window.document.getElementById('nav-admin-link');
      assert.ok(navAdmin, `#nav-admin-link must exist on ${page}`);
      assert.strictEqual(navAdmin.style.display, 'none',
        `nav-admin-link should be hidden for non-admin on ${page}`);
    });

    test(`${page}: nav-admin-link visible for admin`, () => {
      const dom = parsePage(page);
      applyAuth(dom, ADMIN_USER);
      const navAdmin = dom.window.document.getElementById('nav-admin-link');
      assert.ok(navAdmin, `#nav-admin-link must exist on ${page}`);
      assert.notStrictEqual(navAdmin.style.display, 'none',
        `nav-admin-link should be visible for admin on ${page}`);
    });
  }

  // Pages that should have #footer-admin-link
  const PAGES_WITH_FOOTER_ADMIN = [
    'index.html', 'admin.html', 'admin-recommendations.html',
    'rec-detail.html', 'recommendations.html', 'bugs.html', 'features.html',
    'about.html', 'members.html', 'minutes.html', 'resources.html',
    'assessment.html',
  ];

  for (const page of PAGES_WITH_FOOTER_ADMIN) {
    test(`${page}: #footer-admin-link exists`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('footer-admin-link');
      assert.ok(el, `#footer-admin-link must exist on ${page}`);
    });

    test(`${page}: footer-admin-link hidden when signed out`, () => {
      const dom = parsePage(page);
      applyAuth(dom, ANON);
      const footerAdmin = dom.window.document.getElementById('footer-admin-link');
      assert.ok(footerAdmin, `#footer-admin-link must exist on ${page}`);
      assert.strictEqual(footerAdmin.style.display, 'none',
        `footer-admin-link should be hidden when signed out on ${page}`);
    });

    test(`${page}: footer-admin-link hidden for non-admin`, () => {
      const dom = parsePage(page);
      applyAuth(dom, REGULAR_USER);
      const footerAdmin = dom.window.document.getElementById('footer-admin-link');
      assert.ok(footerAdmin, `#footer-admin-link must exist on ${page}`);
      assert.strictEqual(footerAdmin.style.display, 'none',
        `footer-admin-link should be hidden for non-admin on ${page}`);
    });

    test(`${page}: footer-admin-link visible for admin`, () => {
      const dom = parsePage(page);
      applyAuth(dom, ADMIN_USER);
      const footerAdmin = dom.window.document.getElementById('footer-admin-link');
      assert.ok(footerAdmin, `#footer-admin-link must exist on ${page}`);
      assert.notStrictEqual(footerAdmin.style.display, 'none',
        `footer-admin-link should be visible for admin on ${page}`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 3: NBRPA → Legends replacement in site-authored copy
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 3 — NBRPA replacement in site copy', () => {
  // These pages should have zero NBRPA occurrences
  const CLEAN_PAGES = [
    'index.html',
    'about.html',
    'members.html',
    'systems-map.html',
    'assessment.html',
    'bugs.html',
    'features.html',
    'recommendations.html',
    'rec-detail.html',
    'admin.html',
    'admin-recommendations.html',
    'minutes.html',
  ];

  for (const page of CLEAN_PAGES) {
    test(`${page}: no NBRPA in site copy`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(!html.includes('NBRPA'),
        `Found NBRPA in ${page} — expected to be replaced with "Legends of Basketball"`);
    });
  }

  test('resources.html: no NBRPA in site-authored copy before Leslie\'s ideas-list', () => {
    const html = fs.readFileSync(path.join(ROOT, 'resources.html'), 'utf8');
    const ideasListStart = html.indexOf('class="ideas-list"');
    assert.ok(ideasListStart > 0, 'ideas-list must exist in resources.html');
    const beforeIdeas = html.slice(0, ideasListStart);
    assert.ok(!beforeIdeas.includes('NBRPA'),
      'NBRPA found in site-authored copy before Leslie\'s proposals in resources.html');
  });

  test('resources.html: Leslie\'s proposals block still contains original NBRPA references', () => {
    const html = fs.readFileSync(path.join(ROOT, 'resources.html'), 'utf8');
    const ideasListStart = html.indexOf('class="ideas-list"');
    const ideasListEnd = html.indexOf('</ul>', ideasListStart);
    const ideasBlock = html.slice(ideasListStart, ideasListEnd);
    assert.ok(ideasBlock.includes('NBRPA'),
      'Leslie\'s proposals block should still contain NBRPA (member-submitted text must not be modified)');
  });

  test('members/willie-davis.html: no NBRPA', () => {
    const html = fs.readFileSync(path.join(ROOT, 'members/willie-davis.html'), 'utf8');
    assert.ok(!html.includes('NBRPA'), 'Found NBRPA in members/willie-davis.html');
  });

  test('members/mo-evans.html: no NBRPA', () => {
    const html = fs.readFileSync(path.join(ROOT, 'members/mo-evans.html'), 'utf8');
    assert.ok(!html.includes('NBRPA'), 'Found NBRPA in members/mo-evans.html');
  });

  test('members/choo-smith.html: no NBRPA', () => {
    const html = fs.readFileSync(path.join(ROOT, 'members/choo-smith.html'), 'utf8');
    assert.ok(!html.includes('NBRPA'), 'Found NBRPA in members/choo-smith.html');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 4: Resources dropdown nav restructure
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 4 — Resources dropdown nav restructure', () => {
  // Pages that had Minutes / Systems Map / Assessment as standalone top-level items
  const RESTRUCTURED_PAGES = [
    'index.html', 'about.html', 'members.html', 'minutes.html',
    'resources.html', 'systems-map.html', 'assessment.html',
    'recommendations.html', 'bugs.html', 'features.html',
    'rec-detail.html', 'admin.html', 'admin-recommendations.html',
  ];

  const MEMBER_PAGES = [
    'members/bruce-capers.html', 'members/choo-smith.html',
    'members/george-tinsley.html', 'members/greg-foster.html',
    'members/herb-lang.html', 'members/leslie-johnson.html',
    'members/lionel-hollins.html', 'members/major-jones.html',
    'members/mo-evans.html', 'members/willie-davis.html',
  ];

  const ALL_NAV_PAGES = [...RESTRUCTURED_PAGES, ...MEMBER_PAGES];

  for (const page of RESTRUCTURED_PAGES) {
    test(`${page}: Minutes is NOT a top-level nav <li> outside the dropdown`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const navLinks = doc.querySelector('ul.nav-links');
      assert.ok(navLinks, `ul.nav-links must exist on ${page}`);
      const topLevelLinks = Array.from(navLinks.querySelectorAll(':scope > li > a'));
      const minutesTopLevel = topLevelLinks.some(a => a.href && a.href.includes('minutes.html') && a.textContent.trim() === 'Minutes');
      assert.ok(!minutesTopLevel, `Minutes should not be a top-level nav item on ${page}`);
    });

    test(`${page}: Systems Map is NOT a top-level nav <li> outside the dropdown`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const navLinks = doc.querySelector('ul.nav-links');
      assert.ok(navLinks, `ul.nav-links must exist on ${page}`);
      const topLevelLinks = Array.from(navLinks.querySelectorAll(':scope > li > a'));
      const sysMapTopLevel = topLevelLinks.some(a => a.href && a.href.includes('systems-map.html') && a.textContent.trim() === 'Systems Map');
      assert.ok(!sysMapTopLevel, `Systems Map should not be a top-level nav item on ${page}`);
    });

    test(`${page}: Assessment is NOT a top-level nav <li> outside the dropdown`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const navLinks = doc.querySelector('ul.nav-links');
      assert.ok(navLinks, `ul.nav-links must exist on ${page}`);
      const topLevelLinks = Array.from(navLinks.querySelectorAll(':scope > li > a'));
      const assessTopLevel = topLevelLinks.some(a => a.href && a.href.includes('assessment.html') && a.textContent.trim() === 'Assessment');
      assert.ok(!assessTopLevel, `Assessment should not be a top-level nav item on ${page}`);
    });
  }

  for (const page of ALL_NAV_PAGES) {
    test(`${page}: Resources dropdown container (.nav-dropdown) exists in nav`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const dropdown = doc.querySelector('ul.nav-links .nav-dropdown');
      assert.ok(dropdown, `nav-dropdown must exist in nav on ${page}`);
    });

    test(`${page}: dropdown contains link to resources.html`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const menu = doc.querySelector('.nav-dropdown-menu');
      assert.ok(menu, `.nav-dropdown-menu must exist on ${page}`);
      const links = Array.from(menu.querySelectorAll('a'));
      const hasResources = links.some(a => a.href && a.href.includes('resources.html') && !a.href.includes('#'));
      assert.ok(hasResources, `dropdown must contain link to resources.html on ${page}`);
    });

    test(`${page}: dropdown contains link to minutes.html`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const menu = doc.querySelector('.nav-dropdown-menu');
      assert.ok(menu, `.nav-dropdown-menu must exist on ${page}`);
      const links = Array.from(menu.querySelectorAll('a'));
      const hasMinutes = links.some(a => a.href && a.href.includes('minutes.html'));
      assert.ok(hasMinutes, `dropdown must contain link to minutes.html on ${page}`);
    });

    test(`${page}: dropdown contains link to systems-map.html`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const menu = doc.querySelector('.nav-dropdown-menu');
      assert.ok(menu, `.nav-dropdown-menu must exist on ${page}`);
      const links = Array.from(menu.querySelectorAll('a'));
      const hasSysMap = links.some(a => a.href && a.href.includes('systems-map.html'));
      assert.ok(hasSysMap, `dropdown must contain link to systems-map.html on ${page}`);
    });

    test(`${page}: dropdown contains link to assessment.html`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const menu = doc.querySelector('.nav-dropdown-menu');
      assert.ok(menu, `.nav-dropdown-menu must exist on ${page}`);
      const links = Array.from(menu.querySelectorAll('a'));
      const hasAssessment = links.some(a => a.href && a.href.includes('assessment.html'));
      assert.ok(hasAssessment, `dropdown must contain link to assessment.html on ${page}`);
    });
  }

  // Auth elements still exist on standard pages (regression guard)
  for (const page of RESTRUCTURED_PAGES) {
    test(`${page}: #login-nav still exists after nav restructure`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('login-nav');
      assert.ok(el, `#login-nav must still exist on ${page} after nav restructure`);
    });

    test(`${page}: #auth-nav still exists after nav restructure`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('auth-nav');
      assert.ok(el, `#auth-nav must still exist on ${page} after nav restructure`);
    });

    test(`${page}: #nav-admin-link still exists after nav restructure`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('nav-admin-link');
      assert.ok(el, `#nav-admin-link must still exist on ${page} after nav restructure`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 5: Coach → Bill naming on AI-manager references
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 5 — Bill (not Coach) as AI-manager name', () => {
  test('index.html: AI-manager reference uses "Bill" not "Coach"', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(!html.includes('Coach — the site'), 'index.html should not use "Coach — the site" naming');
    assert.ok(html.includes('Bill — the site'), 'index.html must use "Bill — the site" naming');
  });

  const AI_MANAGER_PAGES = ['features.html', 'bugs.html', 'recommendations.html', 'admin.html'];

  for (const page of AI_MANAGER_PAGES) {
    test(`${page}: AI-manager triage/review references use "Bill" not "Coach"`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      const coachAsManager = /\bCoach\b(?:'s)?\s+(reviews?|triages?|analyzes?|will review|will triage)/.test(html);
      assert.ok(!coachAsManager, `${page} should not use "Coach" as AI-manager name in review/triage context`);
    });
  }
});
