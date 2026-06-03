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
  // askBillNav is no longer auth-gated — widget is always accessible

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

// ──────────────────────────────────────────────────────────────────────────────
// Punchlist Jun 3 — Item 1: Admin page robustness
// ──────────────────────────────────────────────────────────────────────────────

describe('Punchlist — Admin page robustness', () => {
  test('admin.html: #admin-content initially hidden', () => {
    const dom = parsePage('admin.html');
    const el = dom.window.document.getElementById('admin-content');
    assert.ok(el, '#admin-content must exist in admin.html');
    assert.strictEqual(el.style.display, 'none', 'admin-content should start hidden');
  });

  test('admin.html: #not-authorized initially hidden', () => {
    const dom = parsePage('admin.html');
    const el = dom.window.document.getElementById('not-authorized');
    assert.ok(el, '#not-authorized must exist in admin.html');
    assert.strictEqual(el.style.display, 'none', 'not-authorized should start hidden');
  });

  test('admin.html: has netlifyIdentity error handler', () => {
    const html = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');
    assert.ok(
      html.includes("netlifyIdentity.on('error'") || html.includes('netlifyIdentity.on("error"'),
      'admin.html must register a netlifyIdentity error handler to prevent blank page on widget failure'
    );
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Punchlist Jun 3 — Item 2: Ask Bill committee-only gating
// ──────────────────────────────────────────────────────────────────────────────

describe('Ask Bill nav — always visible, opens widget', () => {
  for (const page of NAV_PAGES) {
    test(`${page}: #ask-bill-nav exists`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('ask-bill-nav');
      assert.ok(el, `#ask-bill-nav must exist on ${page}`);
    });

    test(`${page}: #ask-bill-nav is always visible (no auth-gate)`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('ask-bill-nav');
      assert.ok(el, `#ask-bill-nav must exist on ${page}`);
      assert.notStrictEqual(el.style.display, 'none',
        `ask-bill-nav must not be hidden — widget is always accessible on ${page}`);
    });

    test(`${page}: #ask-bill-nav opens widget (href="#", onclick somaGuide.open)`, () => {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('ask-bill-nav');
      assert.ok(el, `#ask-bill-nav must exist on ${page}`);
      const link = el.querySelector('a');
      assert.ok(link, `#ask-bill-nav must contain an <a> tag on ${page}`);
      assert.ok(
        link.getAttribute('href') === '#',
        `#ask-bill-nav link must have href="#", not an external URL on ${page}`
      );
      assert.ok(
        (link.getAttribute('onclick') || '').includes('somaGuide') &&
        (link.getAttribute('onclick') || '').includes('open'),
        `#ask-bill-nav link must have onclick calling somaGuide.open() on ${page}`
      );
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Resources dropdown: hover-open on desktop, click-toggle on mobile
// ──────────────────────────────────────────────────────────────────────────────

describe('Resources dropdown — hover-open (desktop), click-toggle (mobile)', () => {
  test('css/style.css: hover-open rule exists for desktop (.nav-dropdown:hover .nav-dropdown-menu)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(
      css.includes('.nav-dropdown:hover .nav-dropdown-menu'),
      'Hover-open rule must exist in CSS — desktop opens dropdown on hover'
    );
  });

  test('css/style.css: focus-within rule exists for keyboard accessibility', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(
      css.includes('.nav-dropdown:focus-within .nav-dropdown-menu'),
      'focus-within rule must exist so keyboard users can open the dropdown'
    );
  });

  test('css/style.css: .nav-dropdown.open .nav-dropdown-menu rule exists (for mobile click-toggle)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(
      css.includes('.nav-dropdown.open .nav-dropdown-menu'),
      '.nav-dropdown.open .nav-dropdown-menu rule must exist for mobile click-toggle'
    );
  });

  test('js/nav-dropdown.js: click handler is mobile-only (desktop uses CSS hover)', () => {
    const js = fs.readFileSync(path.join(ROOT, 'js/nav-dropdown.js'), 'utf8');
    assert.ok(
      js.includes('isMobile') || js.includes('innerWidth'),
      'nav-dropdown.js click handler must be gated for mobile only — desktop uses CSS :hover'
    );
  });

  test('css/style.css: .nav-links has align-items: center (Resources aligned with other nav items)', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(
      css.includes('align-items: center'),
      '.nav-links must have align-items: center so the Resources dropdown aligns with other nav items'
    );
  });

  for (const page of NAV_PAGES) {
    test(`${page}: .nav-dropdown-toggle has aria-expanded attribute`, () => {
      const dom = parsePage(page);
      const toggle = dom.window.document.querySelector('.nav-dropdown-toggle');
      assert.ok(toggle, `.nav-dropdown-toggle must exist on ${page}`);
      assert.ok(toggle.hasAttribute('aria-expanded'),
        `nav-dropdown-toggle must have aria-expanded on ${page}`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Punchlist Jun 3 — Item 4: No redundant "Home" nav item
// ──────────────────────────────────────────────────────────────────────────────

describe('Punchlist — No redundant Home nav item', () => {
  const ALL_CHECKED_PAGES = [
    ...NAV_PAGES,
    'members/bruce-capers.html', 'members/choo-smith.html',
    'members/george-tinsley.html', 'members/greg-foster.html',
    'members/herb-lang.html', 'members/leslie-johnson.html',
    'members/lionel-hollins.html', 'members/major-jones.html',
    'members/mo-evans.html', 'members/willie-davis.html',
  ];

  for (const page of ALL_CHECKED_PAGES) {
    test(`${page}: no standalone "Home" top-level nav link`, () => {
      const dom = parsePage(page);
      const doc = dom.window.document;
      const navLinks = doc.querySelector('ul.nav-links');
      assert.ok(navLinks, `ul.nav-links must exist on ${page}`);
      const topLevelLinks = Array.from(navLinks.querySelectorAll(':scope > li > a'));
      const hasHomeLink = topLevelLinks.some(a => {
        const href = (a.getAttribute('href') || '').replace(/^\.\.\//, '');
        const text = a.textContent.trim();
        return href === 'index.html' && text === 'Home';
      });
      assert.ok(!hasHomeLink,
        `"Home" must not be a top-level nav item on ${page} — use the brand logo as the home link`);
    });
  }

  for (const page of ALL_CHECKED_PAGES) {
    test(`${page}: .nav-brand links to home (index.html)`, () => {
      const dom = parsePage(page);
      const brand = dom.window.document.querySelector('a.nav-brand');
      assert.ok(brand, `.nav-brand must exist on ${page}`);
      const href = brand.getAttribute('href') || '';
      assert.ok(
        href.includes('index.html') || href === '/',
        `.nav-brand must link to index.html on ${page} (got "${href}")`
      );
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 6: Leslie card drill-down (resources.html)
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 6 — Leslie card drill-down', () => {
  test('resources.html: #leslie-card element exists', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-card');
    assert.ok(el, '#leslie-card must exist in resources.html');
  });

  test('resources.html: #leslie-card is initially collapsed (aria-expanded=false)', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-card');
    assert.ok(el, '#leslie-card must exist in resources.html');
    assert.strictEqual(el.getAttribute('aria-expanded'), 'false',
      '#leslie-card must start with aria-expanded="false"');
  });

  test('resources.html: #leslie-card is visible (not display:none) by default', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-card');
    assert.ok(el, '#leslie-card must exist in resources.html');
    assert.notStrictEqual(el.style.display, 'none',
      '#leslie-card should be visible (not hidden) by default');
  });

  test('resources.html: #leslie-card has aria-controls pointing to detail panel', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-card');
    assert.ok(el, '#leslie-card must exist');
    assert.strictEqual(el.getAttribute('aria-controls'), 'leslie-ideas-detail',
      '#leslie-card must have aria-controls="leslie-ideas-detail"');
  });

  test('resources.html: #leslie-ideas-detail exists', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-ideas-detail');
    assert.ok(el, '#leslie-ideas-detail must exist in resources.html');
  });

  test('resources.html: #leslie-ideas-detail is initially hidden', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-ideas-detail');
    assert.ok(el, '#leslie-ideas-detail must exist in resources.html');
    assert.strictEqual(el.style.display, 'none',
      '#leslie-ideas-detail should be hidden by default');
  });

  test('resources.html: #leslie-ideas-detail starts with aria-hidden=true', () => {
    const dom = parsePage('resources.html');
    const el = dom.window.document.getElementById('leslie-ideas-detail');
    assert.ok(el, '#leslie-ideas-detail must exist');
    assert.strictEqual(el.getAttribute('aria-hidden'), 'true',
      '#leslie-ideas-detail must start aria-hidden="true"');
  });

  test('resources.html: ideas-list is inside #leslie-ideas-detail', () => {
    const dom = parsePage('resources.html');
    const detail = dom.window.document.getElementById('leslie-ideas-detail');
    assert.ok(detail, '#leslie-ideas-detail must exist');
    const list = detail.querySelector('ul.ideas-list');
    assert.ok(list, 'ul.ideas-list must be inside #leslie-ideas-detail');
  });

  test('resources.html: back button (.leslie-back-btn) exists inside detail panel', () => {
    const dom = parsePage('resources.html');
    const detail = dom.window.document.getElementById('leslie-ideas-detail');
    assert.ok(detail, '#leslie-ideas-detail must exist');
    const btn = detail.querySelector('.leslie-back-btn');
    assert.ok(btn, '.leslie-back-btn must exist inside #leslie-ideas-detail');
  });

  test('resources.html: ideas-list has 15 items (all proposals present)', () => {
    const dom = parsePage('resources.html');
    const list = dom.window.document.querySelector('ul.ideas-list');
    assert.ok(list, 'ul.ideas-list must exist in resources.html');
    const items = list.querySelectorAll('li');
    assert.strictEqual(items.length, 15, 'ideas-list must contain all 15 proposals');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Task 7: Committee-role gating investigation guard
// Confirms no fake committee-role check was introduced — gating stays at
// "any signed-in user" until real Netlify Identity roles are provisioned.
// ──────────────────────────────────────────────────────────────────────────────

describe('Task 7 — Ask Bill gating: no fake committee-role check', () => {
  test('no page contains app_metadata.roles committee check', () => {
    const pages = [...NAV_PAGES, 'index.html'];
    for (const page of pages) {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(
        !html.includes("roles.indexOf('committee')") &&
        !html.includes('roles.includes(\'committee\')'),
        `${page} must not contain a fake committee-role check — use real Netlify Identity roles`
      );
    }
  });

  test('member profile pages have no #ask-bill-nav element', () => {
    const memberPages = [
      'members/bruce-capers.html', 'members/choo-smith.html',
      'members/george-tinsley.html', 'members/greg-foster.html',
      'members/herb-lang.html', 'members/leslie-johnson.html',
      'members/lionel-hollins.html', 'members/major-jones.html',
      'members/mo-evans.html', 'members/willie-davis.html',
    ];
    for (const page of memberPages) {
      const dom = parsePage(page);
      const el = dom.window.document.getElementById('ask-bill-nav');
      assert.ok(!el,
        `${page} must not have #ask-bill-nav — public member profiles have no auth and must not expose Ask Bill`);
    }
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// Ask Bill widget — present on all pages
// ──────────────────────────────────────────────────────────────────────────────

describe('Ask Bill widget — present on all pages', () => {
  const ALL_MAIN_PAGES = [
    'index.html', 'about.html', 'members.html', 'minutes.html',
    'resources.html', 'systems-map.html', 'assessment.html',
    'bugs.html', 'features.html', 'recommendations.html',
    'rec-detail.html', 'admin.html', 'admin-recommendations.html',
  ];
  const MEMBER_PAGES = [
    'members/bruce-capers.html', 'members/choo-smith.html',
    'members/george-tinsley.html', 'members/greg-foster.html',
    'members/herb-lang.html', 'members/leslie-johnson.html',
    'members/lionel-hollins.html', 'members/major-jones.html',
    'members/mo-evans.html', 'members/willie-davis.html',
  ];

  for (const page of ALL_MAIN_PAGES) {
    test(`${page}: soma-guide.css is linked`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(
        html.includes('soma-guide.css'),
        `${page} must link css/soma-guide.css`
      );
    });

    test(`${page}: legends-guide-config.js script is present`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(
        html.includes('legends-guide-config.js'),
        `${page} must include js/legends-guide-config.js`
      );
    });

    test(`${page}: soma-guide.js script is present`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(
        html.includes('soma-guide.js'),
        `${page} must include js/soma-guide.js`
      );
    });
  }

  for (const page of MEMBER_PAGES) {
    test(`${page}: soma-guide widget scripts present`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(html.includes('soma-guide.css'), `${page} must link soma-guide.css`);
      assert.ok(html.includes('legends-guide-config.js'), `${page} must include legends-guide-config.js`);
      assert.ok(html.includes('soma-guide.js'), `${page} must include soma-guide.js`);
    });

    test(`${page}: Ask Bill link opens widget (no bill-talk external link)`, () => {
      const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
      assert.ok(
        !html.includes('href="https://bill-talk.netlify.app"'),
        `${page} must not link to bill-talk.netlify.app — Ask Bill should open the widget`
      );
      assert.ok(
        html.includes('somaGuide') && html.includes('open()'),
        `${page} Ask Bill link must call somaGuide.open()`
      );
    });
  }
});
