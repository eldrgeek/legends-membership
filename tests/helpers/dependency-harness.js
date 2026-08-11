/**
 * Dependency-failure harness — boots a REAL page from this repo in jsdom with
 * one or more external dependencies deliberately made unreachable.
 *
 * Why this exists: the estate had complete coverage of "is it loaded?" and
 * "did it produce an artifact?" and ZERO coverage of "does it still work when
 * a dependency dies?". On 2026-08-11 the soma-guide CDN was 404 in production
 * and nothing noticed. This harness makes failure paths testable.
 *
 * It blocks at TWO layers, because a dependency can die at either:
 *   1. Sub-resource loading (<script src>, <link rel=stylesheet>) — via a
 *      jsdom ResourceLoader that rejects blocked URLs and serves same-origin
 *      files from disk.
 *   2. Runtime XHR/fetch — via a window.fetch router that rejects blocked URLs
 *      and returns realistic responses for everything else.
 *
 * Blocking is by URL SUBSTRING, not by origin, on purpose: 'soma-guide.js'
 * blocks the bundle whether it is served from the CDN or vendored same-origin,
 * so the same test case stays meaningful after the vendoring fix.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, ResourceLoader, VirtualConsole } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');
const ORIGIN = 'http://legends.test';

/** Dependency name -> URL substrings that identify it. */
const DEPENDENCIES = {
  guideBundle: ['soma-guide.js', 'soma-guide.css'],
  billTalk: ['bill-talk.netlify.app'],
  elevenLabs: ['elevenlabs', 'el-proxy', 'esm.sh/@elevenlabs'],
  inference: ['/infer/ask'],
};

/* Always stubbed — third-party infra that is not one of the four dependencies
 * under test. Blocking these would confound the result. */
const ALWAYS_STUBBED = [
  'cdn.jsdelivr.net',
  '/js/soma-auth.js',
  'feedback-svc',
];

function resolveSameOrigin(url) {
  if (!url.startsWith(ORIGIN)) return null;
  let rel = url.slice(ORIGIN.length).split('?')[0].split('#')[0];
  if (rel.startsWith('/')) rel = rel.slice(1);
  const abs = path.join(ROOT, rel);
  if (!abs.startsWith(ROOT)) return null; // path traversal guard
  return abs;
}

class DependencyBlockingLoader extends ResourceLoader {
  constructor(blockedSubstrings, record) {
    super();
    this.blocked = blockedSubstrings;
    this.record = record;
  }

  isBlocked(url) {
    return this.blocked.some((s) => url.includes(s));
  }

  fetch(url) {
    if (this.isBlocked(url)) {
      this.record.blocked.push(url);
      return Promise.reject(new Error(`DEPENDENCY UNREACHABLE (simulated): ${url}`));
    }
    if (ALWAYS_STUBBED.some((s) => url.includes(s))) {
      return Promise.resolve(Buffer.from(''));
    }
    const file = resolveSameOrigin(url);
    if (file) {
      if (!fs.existsSync(file)) {
        this.record.missing.push(url);
        return Promise.reject(new Error(`404 (simulated): ${url}`));
      }
      this.record.loaded.push(url);
      return Promise.resolve(fs.readFileSync(file));
    }
    // Unknown third-party origin: stub empty rather than hit the network.
    return Promise.resolve(Buffer.from(''));
  }
}

/** Minimal SomaAuth stub — signs a member in synchronously. */
function installAuthStub(window, { signedIn = true } = {}) {
  const user = signedIn
    ? { id: 'test-user', email: 'member@legends.test', user_metadata: { full_name: 'Test Member' } }
    : null;
  const session = signedIn ? { user, access_token: 'test-token' } : null;
  window.SomaAuth = {
    _cbs: [],
    init() {
      this._cbs.forEach((cb) => cb('INITIAL_SESSION', session));
    },
    onAuthStateChange(cb) { this._cbs.push(cb); },
    getSession() { return Promise.resolve(session); },
    getRole() { return Promise.resolve('member'); },
    signOut() { return Promise.resolve(); },
    getUser() { return Promise.resolve(user); },
  };
  window.SOMA_AUTH_CONFIG = window.SOMA_AUTH_CONFIG || { url: 'http://supabase.test', anonKey: 'anon' };
}

/**
 * Route window.fetch. Blocked URLs reject (network unreachable). Everything
 * else gets a realistic response so the page behaves as it would in prod.
 */
function installFetchRouter(window, blocked, record) {
  window.fetch = function (input, init) {
    const url = String(typeof input === 'string' ? input : (input && input.url) || '');
    const method = (init && init.method) || 'GET';
    record.fetches.push({ url, method, body: init && init.body });

    if (blocked.some((s) => url.includes(s))) {
      record.blocked.push(url);
      return Promise.reject(new TypeError(`Failed to fetch (simulated outage): ${url}`));
    }

    const json = (obj, status = 200) => Promise.resolve({
      ok: status >= 200 && status < 300,
      status,
      url,
      json: () => Promise.resolve(obj),
      text: () => Promise.resolve(JSON.stringify(obj)),
      blob: () => Promise.resolve({ size: 1, type: 'audio/mpeg' }),
    });

    if (url.includes('/infer/ask')) {
      return json({ answer: 'Inference says: the committee meets monthly.' });
    }
    if (url.includes('/api/recommendations')) {
      return method === 'POST'
        ? json({ ok: true, id: 'rec-123' }, 201)
        : json({ items: [] });
    }
    if (url.includes('submit-feedback')) return json({ ok: true });
    return json({ ok: true });
  };
}

/**
 * Boot a page with the named dependencies unreachable.
 *
 * @param {string} page       repo-relative html file, e.g. 'index.html'
 * @param {object} opts
 * @param {string[]} opts.block  dependency names from DEPENDENCIES
 * @param {boolean} opts.signedIn
 * @returns {Promise<{window, document, record, dom}>}
 */
async function bootPage(page, opts = {}) {
  const names = opts.block || [];
  for (const n of names) {
    if (!DEPENDENCIES[n]) throw new Error(`Unknown dependency: ${n}`);
  }
  const blocked = names.flatMap((n) => DEPENDENCIES[n]);
  const record = { blocked: [], loaded: [], missing: [], fetches: [], errors: [] };

  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (e) => record.errors.push(e.message));
  virtualConsole.on('error', (m) => record.errors.push(String(m)));

  const dom = new JSDOM(html, {
    url: `${ORIGIN}/${page}`,
    runScripts: 'dangerously',
    resources: new DependencyBlockingLoader(blocked, record),
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse(window) {
      installAuthStub(window, opts);
      installFetchRouter(window, blocked, record);
      window.scrollTo = () => {};
      window.HTMLElement.prototype.scrollIntoView = () => {};
      // jsdom has no speechSynthesis / Audio playback
      window.Audio = function () {
        return { play: () => Promise.reject(new Error('no audio in jsdom')), pause() {}, addEventListener() {} };
      };
      window.URL.createObjectURL = () => 'blob:test';
    },
  });

  await settle(dom.window, 20);

  // jsdom does not execute <script type="module">. The soma-guide engine is
  // loaded exactly that way, so emulate it here — honouring the same blocking
  // rules a real browser would hit on a 404.
  await loadModuleScripts(dom, blocked, record);

  // Let DOMContentLoaded handlers and microtasks settle.
  await settle(dom.window, 60);

  return { dom, window: dom.window, document: dom.window.document, record };
}

/** Fetch + evaluate every <script type="module" src>, unless blocked. */
async function loadModuleScripts(dom, blocked, record) {
  const { window } = dom;
  const tags = Array.from(window.document.querySelectorAll('script[type="module"][src]'));
  for (const tag of tags) {
    const url = new window.URL(tag.getAttribute('src'), window.location.href).href;
    if (blocked.some((s) => url.includes(s))) {
      record.blocked.push(url);
      record.errors.push(`Could not load module script: "${url}"`);
      continue;
    }
    const file = resolveSameOrigin(url);
    if (!file || !fs.existsSync(file)) {
      record.missing.push(url);
      record.errors.push(`Could not load module script (404): "${url}"`);
      continue;
    }
    record.loaded.push(url);
    try {
      // The engine is an IIFE, not real ESM — evaluating as a classic script
      // matches how it actually behaves in the browser.
      window.eval(fs.readFileSync(file, 'utf8'));
    } catch (e) {
      record.errors.push(`Module script threw: ${url} — ${e.message}`);
    }
  }
}

/** Advance timers/microtasks so async init finishes. */
function settle(window, ticks = 40) {
  return new Promise((resolve) => {
    let n = 0;
    const step = () => {
      if (++n >= ticks) return resolve();
      setTimeout(step, 1);
    };
    setTimeout(step, 1);
  });
}

/** Text of the page's main readable content. */
function mainText(document) {
  const el = document.querySelector('main') || document.body;
  return ((el.textContent) || '').replace(/\s+/g, ' ').trim();
}

/** Every nav link a member can use to move around the site. */
function navLinks(document) {
  return Array.from(document.querySelectorAll('nav a'))
    .map((a) => (a.getAttribute('href') || '').trim())
    .filter(Boolean);
}

module.exports = {
  ROOT,
  ORIGIN,
  DEPENDENCIES,
  bootPage,
  settle,
  mainText,
  navLinks,
};
