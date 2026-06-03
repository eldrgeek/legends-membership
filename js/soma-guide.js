/* SOMA Guide Widget — portable floating assistant
 *
 * No site-specific logic here. All persona, voice agent, site map,
 * and walkthrough scripts live in the per-site config object:
 *   window.SomaGuideConfig = { persona, voiceAgentId, siteMap, walkthroughs }
 *
 * Integration: include css/soma-guide.css, then the per-site config script,
 * then this script (type="module" or plain — both work).
 */
(function (global) {
  'use strict';

  /* ── Constants ──────────────────────────────────────────────────────────── */
  const ELEVENLABS_ESM = 'https://esm.sh/@elevenlabs/client@latest';

  /* ── SomaGuide class ────────────────────────────────────────────────────── */
  function SomaGuide(cfg) {
    this.cfg = cfg;
    this.ConvClass = null;     // ElevenLabs Conversation class, lazy-loaded
    this.conversation = null;  // active ElevenLabs session
    this.mode = 'minimized';   // minimized | idle | voice | text | walkthrough
    this.wt = null;            // { id, stepIndex } active walkthrough
    this.pendingResume = null; // { id, stepIndex } saved on exit

    var lsKey = 'soma-guide:' + (cfg.persona.id || cfg.persona.name);
    this._lsGet = function (k) { try { return localStorage.getItem(lsKey + ':' + k); } catch(e) { return null; } };
    this._lsSet = function (k, v) { try { localStorage.setItem(lsKey + ':' + k, v); } catch(e) {} };

    this.introduced = this._lsGet('introduced') === '1';

    this._build();
    this._enableDrag();
    this._bindEvents();

    var self = this;
    if (typeof document !== 'undefined' && document.readyState !== 'loading') {
      self._onReady();
    } else if (typeof document !== 'undefined') {
      document.addEventListener('DOMContentLoaded', function () { self._onReady(); });
    }
  }

  SomaGuide.prototype._onReady = function () {
    if (!this.introduced) {
      var self = this;
      setTimeout(function () { self._openIdle(true); }, 500);
    }
  };

  /* ── Build DOM ── */
  SomaGuide.prototype._build = function () {
    var name   = this.cfg.persona.name;
    var avatar = this.cfg.persona.avatar || '💬';

    var el = document.createElement('div');
    el.id = 'soma-guide';
    el.className = 'sg sg--min';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', name + ' Assistant');

    el.innerHTML = [
      '<button class="sg-fab" aria-label="Ask ' + name + '">',
      '  <span class="sg-fab-avatar">' + avatar + '</span>',
      '  <span class="sg-fab-name">Ask ' + name + '</span>',
      '</button>',
      '<div class="sg-panel" aria-hidden="true">',
      '  <div class="sg-header">',
      '    <div class="sg-persona">',
      '      <span class="sg-persona-avatar">' + avatar + '</span>',
      '      <span class="sg-persona-name">' + name + '</span>',
      '    </div>',
      '    <div class="sg-header-btns">',
      '      <button class="sg-btn-text" title="Text chat" aria-label="Text mode">💬</button>',
      '      <button class="sg-btn-voice" title="Voice" aria-label="Voice mode">🎙</button>',
      '      <button class="sg-btn-min" title="Minimize" aria-label="Minimize">−</button>',
      '    </div>',
      '  </div>',
      '  <div class="sg-body">',
      '    <div class="sg-idle-ui">',
      '      <p class="sg-greeting"></p>',
      '      <div class="sg-topic-list"></div>',
      '    </div>',
      '    <div class="sg-voice-ui" hidden>',
      '      <div class="sg-orb"></div>',
      '      <p class="sg-voice-status">Tap to speak</p>',
      '      <p class="sg-voice-transcript"></p>',
      '    </div>',
      '    <div class="sg-text-ui" hidden>',
      '      <div class="sg-messages" role="log" aria-live="polite"></div>',
      '      <div class="sg-input-bar">',
      '        <input class="sg-input" type="text" placeholder="Ask me anything…" aria-label="Message">',
      '        <button class="sg-send" aria-label="Send">↑</button>',
      '      </div>',
      '    </div>',
      '    <div class="sg-wt-ui" hidden>',
      '      <p class="sg-wt-narration"></p>',
      '      <p class="sg-wt-instruction"></p>',
      '    </div>',
      '  </div>',
      '  <div class="sg-wt-bar" hidden>',
      '    <button class="sg-wt-exit">Exit</button>',
      '    <span class="sg-wt-prog"></span>',
      '    <button class="sg-wt-next">Next →</button>',
      '  </div>',
      '  <div class="sg-resume-bar" hidden>',
      '    <p>Pick up where you left off?</p>',
      '    <div class="sg-resume-steps"></div>',
      '    <div class="sg-resume-btns">',
      '      <button class="sg-wt-restart">Start over</button>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    document.body.appendChild(el);
    this.el = el;
    this._$ = function (sel) { return el.querySelector(sel); };
  };

  /* ── Drag ── */
  SomaGuide.prototype._enableDrag = function () {
    var self   = this;
    var header = this._$('.sg-header');
    var dragging = false, ox = 0, oy = 0;

    function onDown(cx, cy) {
      dragging = true;
      var r = self.el.getBoundingClientRect();
      ox = cx - r.left;
      oy = cy - r.top;
    }
    function onMove(cx, cy) {
      if (!dragging) return;
      self.el.style.left   = (cx - ox) + 'px';
      self.el.style.top    = (cy - oy) + 'px';
      self.el.style.right  = 'auto';
      self.el.style.bottom = 'auto';
    }
    function onUp() { dragging = false; }

    header.addEventListener('mousedown', function (e) {
      if (e.target.closest('button')) return;
      onDown(e.clientX, e.clientY);
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) { onMove(e.clientX, e.clientY); });
    document.addEventListener('mouseup', onUp);

    header.addEventListener('touchstart', function (e) {
      if (e.target.closest('button')) return;
      var t = e.touches[0];
      onDown(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!dragging) return;
      var t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });
    document.addEventListener('touchend', onUp);
  };

  /* ── Bind events ── */
  SomaGuide.prototype._bindEvents = function () {
    var self = this;

    this._$('.sg-fab').addEventListener('click', function () { self._openIdle(false); });
    this._$('.sg-btn-min').addEventListener('click', function () { self._minimize(); });
    this._$('.sg-btn-text').addEventListener('click', function () { self._openText(); });
    this._$('.sg-btn-voice').addEventListener('click', function () { self._openVoice(); });

    this._$('.sg-wt-next').addEventListener('click', function () { self._wtNext(); });
    this._$('.sg-wt-exit').addEventListener('click', function () { self._wtExit(); });
    this._$('.sg-wt-restart').addEventListener('click', function () {
      if (self.pendingResume) self._wtStart(self.pendingResume.id, 0);
    });

    var input = this._$('.sg-input');
    this._$('.sg-send').addEventListener('click', function () { self._sendText(input.value); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self._sendText(input.value); }
    });

    this._renderTopicList();
  };

  SomaGuide.prototype._renderTopicList = function () {
    var self = this;
    var list = this._$('.sg-topic-list');
    var wts  = this.cfg.walkthroughs || [];
    list.innerHTML = wts.map(function (w) {
      return '<button class="sg-topic-btn" data-wt="' + w.id + '">▶ ' + w.label + '</button>';
    }).join('');
    list.querySelectorAll('.sg-topic-btn').forEach(function (btn) {
      btn.addEventListener('click', function () { self._wtStart(btn.getAttribute('data-wt'), 0); });
    });
  };

  /* ── Mode transitions ────────────────────────────────────────────────────── */

  SomaGuide.prototype._minimize = function () {
    this._stopConversation();
    this._clearHighlight();
    this.mode = 'minimized';
    this.el.className = 'sg sg--min';
    this._$('.sg-panel').setAttribute('aria-hidden', 'true');
  };

  SomaGuide.prototype._openIdle = function (isFirst) {
    this._setMode('idle');
    var greeting = isFirst ? this.cfg.persona.greeting : this.cfg.persona.shortGreeting;
    this._$('.sg-greeting').textContent = greeting || '';

    var resumeBar = this._$('.sg-resume-bar');
    if (this.pendingResume) {
      this._renderResumeSteps();
      resumeBar.hidden = false;
    } else {
      resumeBar.hidden = true;
    }

    if (isFirst) {
      this._lsSet('introduced', '1');
      this.introduced = true;
    }
  };

  SomaGuide.prototype._openText = function () {
    this._setMode('text');
    this._$('.sg-input').focus();
  };

  SomaGuide.prototype._openVoice = function () {
    var self = this;
    this._setMode('voice');
    this._$('.sg-voice-status').textContent = 'Connecting…';
    this._startConversation(false).then(function () {
      self._$('.sg-voice-status').textContent = 'Listening…';
    }).catch(function (e) {
      console.warn('[SomaGuide] voice error', e);
      self._$('.sg-voice-status').textContent = 'Mic unavailable — try text chat instead.';
    });
  };

  SomaGuide.prototype._setMode = function (mode) {
    this._stopConversation();
    this.mode = mode;
    this.el.className = 'sg sg--' + mode;
    this._$('.sg-panel').removeAttribute('aria-hidden');

    this._$('.sg-idle-ui').hidden        = mode !== 'idle';
    this._$('.sg-voice-ui').hidden       = mode !== 'voice';
    this._$('.sg-text-ui').hidden        = mode !== 'text';
    this._$('.sg-wt-ui').hidden          = mode !== 'walkthrough';
    this._$('.sg-wt-bar').hidden         = mode !== 'walkthrough';
    this._$('.sg-resume-bar').hidden     = true;
  };

  /* ── Walkthrough ──────────────────────────────────────────────────────────── */

  SomaGuide.prototype._wtById = function (id) {
    return (this.cfg.walkthroughs || []).filter(function (w) { return w.id === id; })[0] || null;
  };

  SomaGuide.prototype._wtStart = function (id, stepIndex) {
    var wt = this._wtById(id);
    if (!wt) return;
    this._clearHighlight();
    this.wt = { id: id, stepIndex: stepIndex || 0 };
    this.pendingResume = null;
    this._setMode('walkthrough');
    this._renderWtStep();
  };

  SomaGuide.prototype._renderWtStep = function () {
    if (!this.wt) return;
    var wt   = this._wtById(this.wt.id);
    if (!wt) return;
    var step = wt.steps[this.wt.stepIndex];
    if (!step) return;

    this._$('.sg-wt-narration').textContent  = step.narration || '';
    this._$('.sg-wt-instruction').textContent = step.instruction || '';

    var total  = wt.steps.length;
    var cur    = this.wt.stepIndex + 1;
    var isLast = cur >= total;
    this._$('.sg-wt-prog').textContent   = 'Step ' + cur + ' of ' + total;
    this._$('.sg-wt-next').textContent   = isLast ? 'Finish ✓' : 'Next →';

    this._clearHighlight();
    if (step.target) {
      var target = document.querySelector(step.target);
      if (target) {
        target.classList.add('sg-highlight');
        if (typeof target.scrollIntoView === 'function') {
          target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }
  };

  SomaGuide.prototype._wtNext = function () {
    if (!this.wt) return;
    var wt     = this._wtById(this.wt.id);
    if (!wt) return;
    var isLast = this.wt.stepIndex >= wt.steps.length - 1;
    if (isLast) {
      this._wtFinish();
    } else {
      this.wt.stepIndex++;
      this._renderWtStep();
    }
  };

  SomaGuide.prototype._wtFinish = function () {
    this._clearHighlight();
    var done = this.cfg.persona.walkthroughDone || 'All done! Ask me anything.';
    this.wt = null;
    this.pendingResume = null;
    this._openIdle(false);
    this._$('.sg-greeting').textContent = done;
  };

  SomaGuide.prototype._wtExit = function () {
    if (this.wt) {
      this.pendingResume = { id: this.wt.id, stepIndex: this.wt.stepIndex };
    }
    this._clearHighlight();
    this.wt = null;
    this._openIdle(false);
  };

  SomaGuide.prototype._renderResumeSteps = function () {
    var self = this;
    var bar  = this._$('.sg-resume-steps');
    var wt   = this._wtById(this.pendingResume && this.pendingResume.id);
    if (!wt) { bar.innerHTML = ''; return; }

    var curIdx = this.pendingResume.stepIndex;
    bar.innerHTML = wt.steps.map(function (s, i) {
      var cls = 'sg-resume-step' + (i === curIdx ? ' sg-resume-step--current' : '');
      var label = s.label || (s.narration ? s.narration.slice(0, 45) + '…' : ('Step ' + (i+1)));
      return '<button class="' + cls + '" data-i="' + i + '">' + (i+1) + '. ' + label + '</button>';
    }).join('');

    bar.querySelectorAll('.sg-resume-step').forEach(function (btn) {
      btn.addEventListener('click', function () {
        self._wtStart(self.pendingResume.id, parseInt(btn.getAttribute('data-i'), 10));
      });
    });
  };

  SomaGuide.prototype._clearHighlight = function () {
    document.querySelectorAll('.sg-highlight').forEach(function (el) {
      el.classList.remove('sg-highlight');
    });
  };

  /* ── ElevenLabs voice / text ──────────────────────────────────────────────── */

  SomaGuide.prototype._loadConvClass = function () {
    var self = this;
    if (self.ConvClass) return Promise.resolve(self.ConvClass);
    var esmUrl = self.cfg.voiceAgentEsmUrl || ELEVENLABS_ESM;
    return import(esmUrl).then(function (mod) {
      self.ConvClass = mod.Conversation;
      return self.ConvClass;
    });
  };

  SomaGuide.prototype._startConversation = function (textOnly) {
    var self = this;
    var agentId = this.cfg.voiceAgentId;
    if (!agentId) return Promise.reject(new Error('No voiceAgentId configured'));

    return this._loadConvClass().then(function (Conversation) {
      return Conversation.startSession({
        agentId: agentId,
        textOnly: textOnly === true ? true : undefined,
        onMessage: function (data) {
          if (data && data.source === 'ai') self._onAgentMessage(data.message || data.text || '');
        },
        onError: function (msg) { console.warn('[SomaGuide]', msg); },
        onModeChange: function (data) {
          if (self.mode !== 'voice') return;
          var speaking = data && data.mode === 'speaking';
          var orb = self._$('.sg-orb');
          if (orb) orb.classList.toggle('sg-orb--speaking', speaking);
          var status = self._$('.sg-voice-status');
          if (status) status.textContent = speaking ? 'Speaking…' : 'Listening…';
        },
        onDisconnect: function () {
          if (self.mode === 'voice') {
            var status = self._$('.sg-voice-status');
            if (status) status.textContent = 'Disconnected.';
          }
        }
      });
    }).then(function (conv) {
      self.conversation = conv;
      return conv;
    });
  };

  SomaGuide.prototype._stopConversation = function () {
    if (this.conversation) {
      try { this.conversation.endSession(); } catch (e) {}
      this.conversation = null;
    }
  };

  SomaGuide.prototype._onAgentMessage = function (text) {
    if (this.mode === 'text') {
      this._appendMessage('agent', text);
    } else if (this.mode === 'voice') {
      var t = this._$('.sg-voice-transcript');
      if (t) t.textContent = text;
    }
  };

  SomaGuide.prototype._sendText = function (text) {
    if (typeof text !== 'string') return;
    text = text.trim();
    if (!text) return;

    var input = this._$('.sg-input');
    if (input) input.value = '';

    this._appendMessage('user', text);

    /* intent: check if question matches a walkthrough */
    var match = this._matchWalkthrough(text);
    if (match) {
      this._wtStart(match.id, 0);
      return;
    }

    /* route to ElevenLabs text agent */
    var self = this;
    var send = function () {
      if (self.conversation && typeof self.conversation.sendUserMessage === 'function') {
        return Promise.resolve(self.conversation.sendUserMessage(text));
      }
      return self._startConversation(true).then(function (conv) {
        return conv.sendUserMessage(text);
      });
    };

    send().catch(function (e) {
      console.warn('[SomaGuide] send error', e);
      self._appendMessage('agent', 'Sorry, I had trouble connecting — please try again.');
    });
  };

  SomaGuide.prototype._matchWalkthrough = function (text) {
    var lower = text.toLowerCase();
    return (this.cfg.walkthroughs || []).filter(function (wt) {
      return (wt.keywords || []).some(function (kw) { return lower.indexOf(kw) !== -1; });
    })[0] || null;
  };

  SomaGuide.prototype._appendMessage = function (role, text) {
    var msgs = this._$('.sg-messages');
    if (!msgs) return;
    var div = document.createElement('div');
    div.className = 'sg-msg sg-msg--' + role;
    div.textContent = text;
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  };

  /* ── Public API ── */
  SomaGuide.prototype.open    = function () { this._openIdle(false); };
  SomaGuide.prototype.minimize = function () { this._minimize(); };
  SomaGuide.prototype.startWalkthrough = function (id, step) { this._wtStart(id, step || 0); };

  /* ── Auto-init ── */
  global.SomaGuide = SomaGuide;

  if (typeof document !== 'undefined') {
    var init = function () {
      var cfg = global.SomaGuideConfig;
      if (cfg && !global.somaGuide) {
        global.somaGuide = new SomaGuide(cfg);
      }
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  }

}(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this));
