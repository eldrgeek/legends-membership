/**
 * Bill test harness — loads the REAL soma-guide engine with the REAL Bill
 * config (js/legends-guide-config.js + js/legends-knowledge.js) in jsdom.
 *
 * The engine is not vendored in this repo (pages load it from the
 * soma-guide.netlify.app CDN), so tests resolve the source from:
 *   1. $SOMA_GUIDE_SRC                                  (explicit override)
 *   2. ../soma-platform/packages/soma-guide/soma-guide.js (sibling checkout)
 *   3. js/soma-guide.js                                  (legacy vendored copy)
 *
 * Keeping the engine out of this repo is deliberate — the deploy-drift check
 * (tools/verify-deploy.mjs) is what guards CDN/source skew.
 */

'use strict';

const fs   = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..');

function resolveEngineSrc() {
  const candidates = [
    process.env.SOMA_GUIDE_SRC,
    path.join(ROOT, '..', 'soma-platform', 'packages', 'soma-guide', 'soma-guide.js'),
    path.join(ROOT, 'js', 'soma-guide.js'),
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  throw new Error(
    'soma-guide.js engine source not found. Set SOMA_GUIDE_SRC or check out ' +
    'soma-platform as a sibling of this repo (tried: ' + candidates.join(', ') + ')'
  );
}

const ENGINE_PATH   = resolveEngineSrc();
const ENGINE_SRC    = fs.readFileSync(ENGINE_PATH, 'utf8');
const KNOWLEDGE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'legends-knowledge.js'), 'utf8');
const CONFIG_SRC    = fs.readFileSync(path.join(ROOT, 'js', 'legends-guide-config.js'), 'utf8');

/** Read the parsed Bill config in a throwaway window (for config-lint tests). */
function loadBillConfig() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost/', runScripts: 'dangerously'
  });
  dom.window.eval(KNOWLEDGE_SRC);
  dom.window.eval(CONFIG_SRC);
  return dom.window.SomaGuideConfig;
}

/**
 * Boot a jsdom window with engine + Bill config loaded and all network
 * dependencies stubbed. Auto-init is suppressed (SomaGuideConfig is set
 * AFTER the engine evaluates) so each test constructs its own SomaGuide.
 *
 * opts:
 *   url       — page URL (default http://localhost/index.html)
 *   bodyHtml  — extra markup
 *   introduced— seed the introduced flag (default true: no greeting timer)
 *
 * Returns { win, makeGuide(cfgOverrides) } where win exposes:
 *   _fetchCalls, _convStarts, _convMessages, _audioInstances
 */
function makeBillWindow(opts) {
  opts = opts || {};
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body>' + (opts.bodyHtml || '') + '</body></html>',
    { url: opts.url || 'http://localhost/index.html', runScripts: 'dangerously' }
  );
  const win = dom.window;

  if (opts.introduced !== false) {
    win.localStorage.setItem('soma-guide:legends-bill:introduced', '1');
  }

  /* ElevenLabs conversation stub — counts session starts, records messages */
  win.eval(`
    window._convStarts = 0;
    window._convMessages = [];
    window.__importStub = function () {
      return Promise.resolve({ Conversation: { startSession: function () {
        window._convStarts++;
        return Promise.resolve({
          endSession: function () {},
          sendUserMessage: function (m) { window._convMessages.push(m); }
        });
      } } });
    };
  `);

  /* Network stub — inference answers, feedback accepts, audio 404s */
  win.eval(`
    window._fetchCalls = [];
    window.fetch = function (url, init) {
      window._fetchCalls.push({ url: String(url), init: init || null });
      var u = String(url);
      if (u.includes('/infer')) {
        return Promise.resolve({ json: function () { return Promise.resolve({ answer: 'Grounded answer from Bill.' }); } });
      }
      if (u.includes('submit-feedback')) {
        return Promise.resolve({ status: 200, json: function () { return Promise.resolve({ ok: true }); } });
      }
      return Promise.resolve({ ok: false, status: 404, json: function () { return Promise.resolve({}); }, blob: function () { return Promise.resolve(null); } });
    };
  `);

  win.eval(KNOWLEDGE_SRC);
  win.eval(ENGINE_SRC);   /* engine first: SomaGuideConfig not set yet → no auto-init */
  win.eval(CONFIG_SRC);

  function makeGuide(cfgOverrides) {
    const cfg = win.SomaGuideConfig;
    if (cfgOverrides) Object.assign(cfg, cfgOverrides);
    return new win.SomaGuide(cfg);
  }

  return { win, makeGuide };
}

/**
 * Route classifier for scenario tests: send a message through a fresh Bill
 * and report which subsystem handled it.
 * Returns one of: 'tour:<id>' | 'feedback:bug' | 'feedback:feature'
 *                 | 'deflect' | 'inference' | 'conversation'
 */
function routeOf(message) {
  const { win, makeGuide } = makeBillWindow();
  const g = makeGuide();
  g._openText({ skipPreStart: true });
  const fetchesBefore = win._fetchCalls.length;
  g._sendText(message);

  if (g.mode === 'walkthrough' && g.wt) return 'tour:' + g.wt.id;

  const form = win.document.querySelector('.sg-feedback-form');
  if (form) {
    const title = form.querySelector('.sg-feedback-form-title').textContent;
    return title.includes('Bug') ? 'feedback:bug' : 'feedback:feature';
  }

  const agentMsgs = win.document.querySelectorAll('.sg-msg--agent .sg-msg-text');
  const last = agentMsgs.length ? agentMsgs[agentMsgs.length - 1].textContent : '';
  if (last && win.SomaGuideConfig.scopeGuard &&
      last === win.SomaGuideConfig.scopeGuard.deflect) return 'deflect';

  const newFetches = win._fetchCalls.slice(fetchesBefore);
  if (newFetches.some(f => f.url.includes('/infer'))) return 'inference';

  return 'conversation';
}

module.exports = { ROOT, ENGINE_PATH, loadBillConfig, makeBillWindow, routeOf };
