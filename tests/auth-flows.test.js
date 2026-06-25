'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const LOGIN_HTML = fs.readFileSync(path.join(ROOT, 'login.html'), 'utf8');

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function loadLogin(options = {}) {
  const calls = [];
  const methods = Object.assign({
    magicLink: true,
    emailOtp: false,
    password: true,
    phone: false,
    oauth: [],
  }, options.methods || {});

  const dom = new JSDOM(LOGIN_HTML, {
    url: options.url || 'https://legends-membership.netlify.app/login.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    beforeParse(window) {
      window.SomaAuth = {
        getMethods() { return methods; },
        providerMeta(provider) {
          return { label: provider, color: '#fff', text: '#111', border: '#ddd' };
        },
        onAuthStateChange(handler) {
          calls.push({ fn: 'onAuthStateChange', handler });
          return window.SomaAuth;
        },
        init(url, anonKey) {
          calls.push({ fn: 'init', url, anonKey });
          return window.SomaAuth;
        },
        signInWithOtp(email, opts) {
          calls.push({ fn: 'signInWithOtp', email, opts });
          return Promise.resolve({ data: {}, error: null });
        },
        signInWithPassword(email, password) {
          calls.push({ fn: 'signInWithPassword', email, password });
          return Promise.resolve({ data: {}, error: null });
        },
        signUp(email, password, opts) {
          calls.push({ fn: 'signUp', email, password, opts });
          return Promise.resolve({ data: {}, error: null });
        },
        resetPasswordForEmail(email, redirectTo) {
          calls.push({ fn: 'resetPasswordForEmail', email, redirectTo });
          return Promise.resolve({ data: {}, error: null });
        },
        updateUser(attrs) {
          calls.push({ fn: 'updateUser', attrs });
          return Promise.resolve({ data: {}, error: null });
        },
        signInWithPhone(phone) {
          calls.push({ fn: 'signInWithPhone', phone });
          return Promise.resolve({ data: {}, error: null });
        },
        verifyPhoneOtp(phone, token) {
          calls.push({ fn: 'verifyPhoneOtp', phone, token });
          return Promise.resolve({ data: {}, error: null });
        },
        signInWithOAuth(provider, opts) {
          calls.push({ fn: 'signInWithOAuth', provider, opts });
          return Promise.resolve({ data: {}, error: null });
        },
      };
      window.SOMA_AUTH_CONFIG = { url: 'https://example.supabase.co', anonKey: 'anon-key' };
    },
  });

  await tick();
  return { dom, calls };
}

function click(document, selector) {
  const el = document.querySelector(selector);
  assert.ok(el, `Expected ${selector} to exist`);
  el.click();
  return el;
}

function byFn(calls, fn) {
  return JSON.parse(JSON.stringify(calls.filter((call) => call.fn === fn)));
}

describe('login.html auth flows', () => {
  test('default secure-link flow sends the existing magic login email', async () => {
    const { dom, calls } = await loadLogin();
    const doc = dom.window.document;

    doc.getElementById('login-email').value = 'member@example.com';
    click(doc, '#magic-btn');
    await tick();

    assert.deepEqual(byFn(calls, 'signInWithOtp'), [{
      fn: 'signInWithOtp',
      email: 'member@example.com',
      opts: {
        emailRedirectTo: 'https://legends-membership.netlify.app/members.html',
      },
    }]);
    assert.match(doc.getElementById('login-msg').textContent, /sign-in link/i);
    dom.window.close();
  });

  test('create new access sends an email setup link and creates a user when needed', async () => {
    const { dom, calls } = await loadLogin();
    const doc = dom.window.document;

    click(doc, '[data-auth-mode="signup"]');
    doc.getElementById('login-email').value = 'new.member@example.com';
    click(doc, '#pw-signup-btn');
    await tick();

    assert.deepEqual(byFn(calls, 'signInWithOtp'), [{
      fn: 'signInWithOtp',
      email: 'new.member@example.com',
      opts: {
        emailRedirectTo: 'https://legends-membership.netlify.app/members.html',
        shouldCreateUser: true,
      },
    }]);
    assert.equal(byFn(calls, 'signUp').length, 0);
    assert.match(doc.getElementById('login-msg').textContent, /setup link/i);
    dom.window.close();
  });

  test('forgot password sends reset email with recovery redirect', async () => {
    const { dom, calls } = await loadLogin();
    const doc = dom.window.document;

    click(doc, '[data-auth-mode="password"]');
    doc.getElementById('login-email').value = 'member@example.com';
    click(doc, '#email-links a');
    await tick();

    assert.deepEqual(byFn(calls, 'resetPasswordForEmail'), [{
      fn: 'resetPasswordForEmail',
      email: 'member@example.com',
      redirectTo: 'https://legends-membership.netlify.app/login.html?recovery=1',
    }]);
    assert.match(doc.getElementById('login-msg').textContent, /reset email sent/i);
    dom.window.close();
  });

  test('recovery page updates the password after matching confirmation', async () => {
    const { dom, calls } = await loadLogin({
      url: 'https://legends-membership.netlify.app/login.html?recovery=1',
    });
    const doc = dom.window.document;

    assert.equal(doc.getElementById('auth-panel').classList.contains('hidden'), true);
    assert.equal(doc.getElementById('recovery-panel').classList.contains('hidden'), false);

    doc.getElementById('recovery-pw').value = 'new-password';
    doc.getElementById('recovery-pw2').value = 'new-password';
    click(doc, '#recovery-btn');
    await tick();

    assert.deepEqual(byFn(calls, 'updateUser'), [{
      fn: 'updateUser',
      attrs: { password: 'new-password' },
    }]);
    assert.match(doc.getElementById('login-msg').textContent, /password updated/i);
    dom.window.close();
  });

  test('password-only configuration still uses Supabase password signup', async () => {
    const { dom, calls } = await loadLogin({
      methods: { magicLink: false, emailOtp: false, password: true },
    });
    const doc = dom.window.document;

    click(doc, '[data-auth-mode="signup"]');
    doc.getElementById('login-email').value = 'password.member@example.com';
    doc.getElementById('login-password').value = 'long-enough';
    doc.getElementById('login-password-confirm').value = 'long-enough';
    click(doc, '#pw-signup-btn');
    await tick();

    assert.deepEqual(byFn(calls, 'signUp'), [{
      fn: 'signUp',
      email: 'password.member@example.com',
      password: 'long-enough',
      opts: {
        emailRedirectTo: 'https://legends-membership.netlify.app/login.html?confirmed=1',
      },
    }]);
    dom.window.close();
  });

  test('password-only signup requires repeated password to match', async () => {
    const { dom, calls } = await loadLogin({
      methods: { magicLink: false, emailOtp: false, password: true },
    });
    const doc = dom.window.document;

    click(doc, '[data-auth-mode="signup"]');
    assert.equal(doc.getElementById('login-password-confirm').classList.contains('hidden'), false);

    doc.getElementById('login-email').value = 'password.member@example.com';
    doc.getElementById('login-password').value = 'long-enough';
    doc.getElementById('login-password-confirm').value = 'different';
    click(doc, '#pw-signup-btn');
    await tick();

    assert.equal(byFn(calls, 'signUp').length, 0);
    assert.match(doc.getElementById('login-msg').textContent, /passwords do not match/i);
    dom.window.close();
  });
});
