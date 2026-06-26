'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const COMMUNITY_NAV_JS = fs.readFileSync(path.join(ROOT, 'js/community-nav.js'), 'utf8');

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadNav(session, role = null, url = 'https://legends-membership.netlify.app/index.html') {
  const dom = new JSDOM(`
    <!doctype html>
    <body>
      <nav>
        <ul class="nav-links">
          <li><a href="index.html">Home</a></li>
          <li id="login-nav"><a href="login.html">Sign in or sign up</a></li>
          <li id="nav-admin-link" style="display:none;"><a href="admin.html">Admin</a></li>
          <li id="auth-nav" style="display:none;"></li>
        </ul>
      </nav>
    </body>
  `, {
    url,
    runScripts: 'dangerously',
    beforeParse(window) {
      window.SomaAuth = {
        onAuthStateChange(handler) {
          window._authHandler = handler;
          return window.SomaAuth;
        },
        getSession() {
          return Promise.resolve({ data: { session } });
        },
        getRole() {
          return Promise.resolve(role);
        },
      };
      window.LegendsNavDropdown = {
        initOne(el) {
          el.setAttribute('data-dropdown-ready', '1');
        },
      };
    },
  });

  dom.window.eval(COMMUNITY_NAV_JS);
  await tick();
  await tick();
  return dom;
}

describe('Community nav', () => {
  test('visitor does not see Community menu', async () => {
    const dom = await loadNav(null);
    const menu = dom.window.document.getElementById('nav-community-link');
    assert.ok(menu);
    assert.equal(menu.style.display, 'none');
    assert.equal(dom.window.document.body.getAttribute('data-community-role'), 'visitor');
    dom.window.close();
  });

  test('registered signed-in user sees Community menu', async () => {
    const dom = await loadNav({ user: { email: 'fan@example.com' } });
    const menu = dom.window.document.getElementById('nav-community-link');
    assert.ok(menu);
    assert.equal(menu.style.display, 'list-item');
    assert.match(menu.textContent, /Community/);
    assert.match(menu.textContent, /Information/);
    assert.match(menu.textContent, /Chat/);
    assert.match(menu.textContent, /Video Meet/);
    assert.equal(dom.window.document.body.getAttribute('data-community-role'), 'registered');
    dom.window.close();
  });

  test('committee email is classified as committee', async () => {
    const dom = await loadNav({ user: { email: 'Purvis.Short@icloud.com' } });
    assert.equal(dom.window.LegendsCommunityNav.roleFor({ email: 'Purvis.Short@icloud.com' }), 'committee');
    assert.equal(dom.window.document.body.getAttribute('data-community-role'), 'committee');
    dom.window.close();
  });

  test('admin role outranks committee and registered status', async () => {
    const dom = await loadNav({ user: { email: 'fan@example.com' } }, 'admin');
    assert.equal(dom.window.LegendsCommunityNav.roleFor({ email: 'fan@example.com' }, 'admin'), 'admin');
    assert.equal(dom.window.document.body.getAttribute('data-community-role'), 'admin');
    dom.window.close();
  });

  test('member profile pages get parent-relative Community links', async () => {
    const dom = await loadNav({ user: { email: 'fan@example.com' } }, null, 'https://legends-membership.netlify.app/members/purvis-short.html');
    const firstLink = dom.window.document.querySelector('#nav-community-link a');
    assert.equal(firstLink.getAttribute('href'), '../community-info.html');
    dom.window.close();
  });
});
