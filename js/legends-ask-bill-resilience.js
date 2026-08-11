/* Legends — Ask Bill resilience layer
 * ===================================
 *
 * WHY THIS EXISTS
 * ---------------
 * Ask Bill hangs off a four-link chain: the soma-guide widget bundle, the
 * bill-talk conversation site, ElevenLabs for voice, and the VPS /infer/ask
 * endpoint for text. On 2026-08-11 link one (soma-guide.netlify.app) was
 * returning 404 for its entire site. Production still shipped the reference,
 * so window.somaGuide was undefined for every member and the in-page
 * "Ask Bill →" button did nothing at all. It "degraded" only by accident: the
 * nav link happened to have an href to fall through to.
 *
 * This file replaces that accident with intent. It guarantees:
 *   - a member can always open SOMETHING when they click Ask Bill
 *   - a member can always get a text answer, from local knowledge if every
 *     network dependency is down
 *   - when voice dies, the member is TOLD, instead of Bill silently going mute
 *
 * Voice and inference may degrade. Navigation, reading content and submitting
 * a request must not — that contract is enforced by
 * tests/dependency-failures.test.js.
 *
 * Load order (all pages):
 *   js/legends-knowledge.js
 *   js/legends-guide-config.js
 *   js/legends-ask-bill-resilience.js
 *   vendor/soma-guide/soma-guide.js   (type=module)
 */
(function (window, document) {
  'use strict';

  var BILL_TALK = 'https://bill-talk.netlify.app';
  var ENGINE_WAIT_MS = 4000;

  var state = {
    voice: 'unknown',       /* 'unknown' | 'ok' | 'unavailable' */
    inference: 'unknown',   /* 'unknown' | 'ok' | 'unavailable' */
    engine: 'unknown',      /* 'unknown' | 'ok' | 'unavailable' */
    lastQuestion: ''
  };

  function cfg() { return window.SomaGuideConfig || {}; }

  function knowledgeText() {
    if (typeof window.LegendsKnowledge === 'string') return window.LegendsKnowledge;
    var c = cfg();
    return typeof c.knowledge === 'string' ? c.knowledge : '';
  }

  /* ── Local retrieval ──────────────────────────────────────────────────
   * A deliberately small, dependency-free retriever over the knowledge pack
   * that already ships with every page. No network. This is the floor: the
   * worst case a member can hit is still a real answer about Legends. */

  var STOP = {
    the: 1, a: 1, an: 1, and: 1, or: 1, of: 1, to: 1, in: 1, on: 1, for: 1, is: 1,
    are: 1, was: 1, were: 1, do: 1, does: 1, did: 1, how: 1, what: 1, when: 1,
    where: 1, who: 1, why: 1, can: 1, i: 1, you: 1, me: 1, my: 1, it: 1, that: 1,
    this: 1, with: 1, about: 1, from: 1, get: 1, tell: 1, please: 1
  };

  function terms(q) {
    return String(q || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(function (w) { return w.length > 2 && !STOP[w]; });
  }

  function chunks() {
    return knowledgeText()
      .split(/\n\s*\n/)
      .map(function (s) { return s.replace(/\s+/g, ' ').trim(); })
      .filter(function (s) { return s.length > 60; });
  }

  /**
   * Best-effort grounded answer from the local knowledge pack.
   * Pure and synchronous — makes NO network calls, by design.
   */
  function localAnswer(question) {
    var ts = terms(question);
    var cs = chunks();
    if (!cs.length) {
      return 'I can point you around the site — try the Members, Recommendations or ' +
             'Resources pages from the menu above.';
    }

    var scored = cs.map(function (text) {
      var lower = text.toLowerCase();
      var score = 0;
      for (var i = 0; i < ts.length; i++) {
        if (lower.indexOf(ts[i]) !== -1) score += 1;
      }
      return { text: text, score: score };
    }).sort(function (a, b) { return b.score - a.score; });

    var picked = scored.filter(function (s) { return s.score > 0; }).slice(0, 2);
    if (!picked.length) picked = scored.slice(0, 1); /* always say something real */

    var body = picked.map(function (p) { return p.text; }).join('\n\n');
    if (body.length > 900) body = body.slice(0, 900).replace(/\s+\S*$/, '') + '…';

    return body + '\n\nThat is from the committee\'s own notes on this site. For a fuller ' +
           'conversation with Bill, open ' + BILL_TALK + '.';
  }

  /* ── Passive dependency health ────────────────────────────────────────
   * Tap window.fetch to OBSERVE outcomes. Semantics are untouched: the same
   * promise is returned and errors are re-thrown. This is how voice death
   * stops being silent — the engine's own TTS path swallows its errors. */

  function matches(url, needles) {
    for (var i = 0; i < needles.length; i++) {
      if (needles[i] && url.indexOf(needles[i]) !== -1) return true;
    }
    return false;
  }

  function voiceUrls() {
    var c = cfg();
    return [c.ttsProxyUrl || '', 'elevenlabs', 'el-proxy'];
  }

  function installFetchObserver() {
    var orig = window.fetch;
    if (typeof orig !== 'function' || orig.__legendsObserved) return;

    var wrapped = function (input, init) {
      var url = String(typeof input === 'string' ? input : (input && input.url) || '');
      var isVoice = matches(url, voiceUrls());
      var isInfer = !!cfg().inferenceUrl && url.indexOf(cfg().inferenceUrl) !== -1;

      var p;
      try {
        p = orig.apply(window, arguments);
      } catch (e) {
        if (isVoice) markVoiceDown();
        if (isInfer) state.inference = 'unavailable';
        throw e;
      }

      if (!p || typeof p.then !== 'function') return p;

      return p.then(function (res) {
        if (isVoice) { if (res && res.ok === false) markVoiceDown(); else state.voice = 'ok'; }
        if (isInfer) { state.inference = (res && res.ok === false) ? 'unavailable' : 'ok'; }
        return res;
      }, function (err) {
        if (isVoice) markVoiceDown();
        if (isInfer) state.inference = 'unavailable';
        throw err;
      });
    };
    wrapped.__legendsObserved = true;
    window.fetch = wrapped;
  }

  function markVoiceDown() {
    if (state.voice === 'unavailable') return;
    state.voice = 'unavailable';
    showVoiceNotice();
  }

  function textOnlyNotice() {
    return 'Bill\'s voice is unavailable right now — he\'s answering in text only. ' +
           'Everything else still works.';
  }

  function showVoiceNotice() {
    try {
      if (document.querySelector('[data-ask-bill-voice-notice]')) return;
      var host = document.querySelector('[data-ask-bill-messages]');
      if (!host) return;
      var el = document.createElement('div');
      el.setAttribute('data-ask-bill-voice-notice', '');
      el.className = 'ask-bill-notice';
      el.textContent = textOnlyNotice();
      host.appendChild(el);
    } catch (e) { /* never let a notice break the page */ }
  }

  /* ── Text answer ──────────────────────────────────────────────────────
   * Try inference; fall back to local knowledge. Never dead-ends, and never
   * punts the member to voice chat (which may also be down). */

  function ask(question) {
    state.lastQuestion = question;
    var c = cfg();
    var url = c.inferenceUrl;

    if (!url || typeof window.fetch !== 'function') {
      return Promise.resolve({ answer: localAnswer(question), source: 'local' });
    }

    var payload = {
      question: question,
      context: [knowledgeText()].filter(Boolean).join('\n\n').slice(0, 8000),
      persona: (c.persona && c.persona.name) || 'Bill',
      app_id: (c.persona && c.persona.id) || 'legends-bill'
    };

    return window.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res || res.ok === false) throw new Error('inference status');
      return res.json();
    }).then(function (data) {
      var a = data && typeof data.answer === 'string' ? data.answer.trim() : '';
      if (!a) throw new Error('empty answer');
      return { answer: a, source: 'inference' };
    }).catch(function () {
      state.inference = 'unavailable';
      return { answer: localAnswer(question), source: 'local' };
    });
  }

  /** Attempt voice. Resolves either way; records health so failure is visible. */
  function speak(text) {
    var c = cfg();
    if (!c.ttsProxyUrl || !c.voiceAgentId || typeof window.fetch !== 'function') {
      markVoiceDown();
      return Promise.resolve({ spoken: false, reason: 'not-configured' });
    }
    var url = c.ttsProxyUrl +
      '?action=tts&text=' + encodeURIComponent(String(text || '').slice(0, 500)) +
      '&agent_id=' + encodeURIComponent(c.voiceAgentId);

    return window.fetch(url).then(function (res) {
      if (!res || res.ok === false) { markVoiceDown(); return { spoken: false, reason: 'status' }; }
      state.voice = 'ok';
      return { spoken: true };
    }).catch(function () {
      markVoiceDown();
      return { spoken: false, reason: 'unreachable' };
    });
  }

  /* ── Fallback panel ───────────────────────────────────────────────────
   * Shown when the widget bundle itself did not load. Same-origin, no deps,
   * no styling requirements beyond inline rules. */

  var PANEL_CSS = [
    '.ask-bill-fallback{position:fixed;right:20px;bottom:20px;width:min(380px,calc(100vw - 40px));',
    'max-height:min(70vh,560px);display:none;flex-direction:column;z-index:99999;background:#12213c;',
    'color:#f2f4f8;border:1px solid rgba(255,255,255,.16);border-radius:14px;overflow:hidden;',
    'box-shadow:0 18px 48px rgba(0,0,0,.45);font-family:inherit;font-size:.92rem}',
    '.ask-bill-fallback__head{display:flex;align-items:center;justify-content:space-between;gap:8px;',
    'padding:12px 14px;background:rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.10)}',
    '.ask-bill-fallback__head button{background:none;border:none;color:inherit;font-size:1.3rem;',
    'line-height:1;cursor:pointer;padding:0 4px}',
    '.ask-bill-fallback__msgs{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:10px}',
    '.ask-bill-msg{white-space:pre-wrap;line-height:1.45;padding:9px 12px;border-radius:10px;max-width:92%}',
    '.ask-bill-msg--bill{background:rgba(255,255,255,.08);align-self:flex-start}',
    '.ask-bill-msg--you{background:#c8a24a;color:#1a1a1a;align-self:flex-end}',
    '.ask-bill-notice{font-size:.8rem;opacity:.85;font-style:italic;padding:6px 12px;',
    'border-left:2px solid #c8a24a}',
    '.ask-bill-fallback__form{display:flex;gap:8px;padding:10px 12px;border-top:1px solid rgba(255,255,255,.10)}',
    '.ask-bill-fallback__form input{flex:1;min-width:0;padding:9px 11px;border-radius:8px;',
    'border:1px solid rgba(255,255,255,.18);background:rgba(0,0,0,.25);color:inherit;font:inherit}',
    '.ask-bill-fallback__form button{padding:9px 16px;border-radius:8px;border:none;background:#c8a24a;',
    'color:#1a1a1a;font-weight:700;cursor:pointer;font:inherit}',
    '.ask-bill-fallback__foot{padding:9px 14px;border-top:1px solid rgba(255,255,255,.10);font-size:.82rem}',
    '.ask-bill-fallback__foot a{color:#e6c979;text-decoration:none}',
    '@media (max-width:520px){.ask-bill-fallback{right:10px;left:10px;bottom:10px;width:auto}}'
  ].join('');

  function injectPanelCss() {
    if (document.getElementById('ask-bill-fallback-css')) return;
    var st = document.createElement('style');
    st.id = 'ask-bill-fallback-css';
    st.textContent = PANEL_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  function buildPanel() {
    var existing = document.querySelector('[data-ask-bill-panel]');
    if (existing) return existing;
    injectPanelCss();

    var panel = document.createElement('div');
    panel.setAttribute('data-ask-bill-panel', '');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Ask Bill');
    panel.className = 'ask-bill-fallback';

    var head = document.createElement('div');
    head.className = 'ask-bill-fallback__head';
    head.innerHTML = '<strong>🏀 Ask Bill</strong>';

    var close = document.createElement('button');
    close.type = 'button';
    close.setAttribute('data-ask-bill-close', '');
    close.setAttribute('aria-label', 'Close');
    close.textContent = '×';
    close.addEventListener('click', function () { panel.removeAttribute('data-open'); panel.style.display = 'none'; });
    head.appendChild(close);

    var msgs = document.createElement('div');
    msgs.setAttribute('data-ask-bill-messages', '');
    msgs.className = 'ask-bill-fallback__msgs';

    var intro = document.createElement('div');
    intro.className = 'ask-bill-msg ask-bill-msg--bill';
    intro.textContent =
      'I\'m answering from the committee\'s notes on this site right now. ' +
      'Ask me anything about Legends, the committee, or how to get around.';
    msgs.appendChild(intro);

    var form = document.createElement('form');
    form.className = 'ask-bill-fallback__form';

    var input = document.createElement('input');
    input.type = 'text';
    input.setAttribute('data-ask-bill-input', '');
    input.setAttribute('aria-label', 'Your question for Bill');
    input.placeholder = 'Ask Bill a question…';

    var send = document.createElement('button');
    send.type = 'submit';
    send.setAttribute('data-ask-bill-send', '');
    send.textContent = 'Ask';

    form.appendChild(input);
    form.appendChild(send);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var q = (input.value || '').trim();
      if (!q) return;
      input.value = '';
      appendMsg(msgs, 'you', q);
      var thinking = appendMsg(msgs, 'bill', '…');
      ask(q).then(function (res) {
        thinking.textContent = res.answer;
        thinking.setAttribute('data-answer-source', res.source);
      });
    });

    var foot = document.createElement('div');
    foot.className = 'ask-bill-fallback__foot';
    var link = document.createElement('a');
    link.href = BILL_TALK;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open the full conversation with Bill →';
    foot.appendChild(link);

    panel.appendChild(head);
    panel.appendChild(msgs);
    panel.appendChild(form);
    panel.appendChild(foot);
    (document.body || document.documentElement).appendChild(panel);

    if (state.voice === 'unavailable') showVoiceNotice();
    return panel;
  }

  function appendMsg(host, who, text) {
    var el = document.createElement('div');
    el.className = 'ask-bill-msg ask-bill-msg--' + (who === 'you' ? 'you' : 'bill');
    el.textContent = text;
    host.appendChild(el);
    host.scrollTop = host.scrollHeight;
    return el;
  }

  function openPanel() {
    var p = buildPanel();
    p.setAttribute('data-open', '');
    p.style.display = 'flex';
    var input = p.querySelector('[data-ask-bill-input]');
    if (input && input.focus) { try { input.focus(); } catch (e) {} }
    return p;
  }

  /** The single entry point every Ask Bill control should call. */
  function open() {
    if (window.somaGuide && typeof window.somaGuide.open === 'function') {
      state.engine = 'ok';
      try { window.somaGuide.open(); return 'engine'; }
      catch (e) { /* engine present but broken — fall through */ }
    }
    state.engine = 'unavailable';
    openPanel();
    return 'fallback';
  }

  /* ── Engine bridge ────────────────────────────────────────────────────
   * When the engine IS present, upgrade its inference dead-end. The engine
   * says "…can't reach the knowledge base right now. Try voice chat…" — which
   * is useless when voice is also down. Replace it with a real local answer.
   * The sentinel is pinned by a test in tests/dependency-failures.test.js. */

  var DEAD_END = "can't reach the knowledge base right now";

  function bridgeEngine() {
    var g = window.somaGuide;
    if (!g) return false;
    var proto = Object.getPrototypeOf(g);
    if (!proto || proto.__legendsBridged) return true;

    if (typeof proto._askInference === 'function') {
      var origAsk = proto._askInference;
      proto._askInference = function (text) {
        state.lastQuestion = text;
        return origAsk.apply(this, arguments);
      };
    }

    if (typeof proto._appendMessage === 'function') {
      var origAppend = proto._appendMessage;
      proto._appendMessage = function (role, text) {
        if (role === 'agent' && typeof text === 'string' && text.indexOf(DEAD_END) !== -1) {
          state.inference = 'unavailable';
          var better = localAnswer(state.lastQuestion);
          var prefix = 'I can\'t reach my live knowledge base right now, so here\'s what I ' +
                       'have on hand:\n\n';
          return origAppend.call(this, role, prefix + better);
        }
        return origAppend.apply(this, arguments);
      };
    }

    proto.__legendsBridged = true;
    state.engine = 'ok';
    return true;
  }

  /* ── Wiring ───────────────────────────────────────────────────────────
   * Any control with [data-ask-bill] routes through open(). The legacy inline
   * onclick guards (`if(window.somaGuide){...}`) are neutralised by capturing
   * the click first, so a missing engine can no longer produce a dead button. */

  function wireControls() {
    var sels = ['#ask-bill-nav a', '#ask-bill-section button', '[data-ask-bill]'];
    var nodes = [];
    sels.forEach(function (s) {
      Array.prototype.push.apply(nodes, Array.prototype.slice.call(document.querySelectorAll(s)));
    });
    nodes.forEach(function (el) {
      if (el.__askBillWired) return;
      el.__askBillWired = true;
      el.addEventListener('click', function (ev) {
        /* Let a modified click on the nav link behave like a normal link. */
        if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button === 1) return;
        ev.preventDefault();
        ev.stopPropagation();
        open();
      }, true);
    });
  }

  function waitForEngine() {
    var started = Date.now();
    (function poll() {
      if (window.somaGuide) { bridgeEngine(); return; }
      if (Date.now() - started > ENGINE_WAIT_MS) {
        state.engine = 'unavailable';
        return;
      }
      window.setTimeout(poll, 100);
    })();
  }

  /* ── Public API ───────────────────────────────────────────────────────── */

  window.LegendsAskBill = {
    state: state,
    ask: ask,
    speak: speak,
    open: open,
    openPanel: openPanel,
    localAnswer: localAnswer,
    engineAvailable: function () { return !!window.somaGuide; },
    voiceStatus: function () { return state.voice; },
    inferenceStatus: function () { return state.inference; },
    textOnlyNotice: textOnlyNotice,
    _bridgeEngine: bridgeEngine
  };

  installFetchObserver();

  function boot() {
    wireControls();
    waitForEngine();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

}(window, document));
