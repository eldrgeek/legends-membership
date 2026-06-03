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
    this.ConvClass = null;
    this.conversation = null;
    this._convConnected = false;
    this._convBuffer = null;
    this.mode = 'minimized';
    this.wt = null;
    this.pendingResume = null;

    /* Auto-advance state */
    this._autoPlay = true;      // auto-advance steps when tour is active
    this._autoStopped = false;  // user paused auto-advance within walkthrough
    this._autoTimer = null;     // pending setTimeout handle

    /* Demo cursor state */
    this._demoCursor = null;
    this._demoCursorTimer = null;

    var lsBase = 'soma-guide:' + (cfg.persona.id || cfg.persona.name);
    this._lsGet = function (k) { try { return localStorage.getItem(lsBase + ':' + k); } catch(e) { return null; } };
    this._lsSet = function (k, v) { try { localStorage.setItem(lsBase + ':' + k, v); } catch(e) {} };

    var ssBase = 'soma-guide-xp:' + (cfg.persona.id || cfg.persona.name);
    this._ssGet = function (k) { try { return sessionStorage.getItem(ssBase + ':' + k); } catch(e) { return null; } };
    this._ssSet = function (k, v) { try { sessionStorage.setItem(ssBase + ':' + k, v); } catch(e) {} };
    this._ssDel = function (k) { try { sessionStorage.removeItem(ssBase + ':' + k); } catch(e) {} };

    this.introduced = this._lsGet('introduced') === '1';
    this._ttsMuted = this._lsGet('tts-muted') === '1';
    this._ttsAudio = null;

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

  /* Overridable navigation hook — tests can replace this to intercept. */
  SomaGuide.prototype._navigate = function (page) {
    if (typeof location !== 'undefined') {
      location.href = page;
    }
  };

  SomaGuide.prototype._onReady = function () {
    var self = this;

    var xpId   = this._ssGet('wt-id');
    var xpStep = this._ssGet('wt-step');
    if (xpId) {
      this._ssDel('wt-id');
      this._ssDel('wt-step');
      setTimeout(function () { self._wtStart(xpId, parseInt(xpStep, 10) || 0); }, 100);
      return;
    }

    var prId   = this._ssGet('resume-id');
    var prStep = this._ssGet('resume-step');
    if (prId) {
      this.pendingResume = { id: prId, stepIndex: parseInt(prStep, 10) || 0 };
    }

    if (!this.introduced) {
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
      '      <div class="sg-tts-bar">',
      '        <button class="sg-btn-mute sg-btn-icon" title="Mute narration" aria-label="Mute narration">🔊</button>',
      '        <button class="sg-btn-replay sg-btn-icon" title="Replay narration" aria-label="Replay narration">↺</button>',
      '      </div>',
      '    </div>',
      '  </div>',
      '  <div class="sg-wt-bar" hidden>',
      '    <button class="sg-wt-exit" title="Pause tour and save your progress">⏸ Pause</button>',
      '    <span class="sg-wt-prog"></span>',
      '    <button class="sg-wt-playpause sg-btn-icon" title="Pause auto-play" aria-label="Pause auto-play">⏸</button>',
      '    <button class="sg-wt-next">Next →</button>',
      '  </div>',
      '  <div class="sg-resume-bar" hidden>',
      '    <p>Pick up where you left off?</p>',
      '    <div class="sg-resume-steps"></div>',
      '    <div class="sg-resume-btns">',
      '      <button class="sg-wt-resume">▶ Resume</button>',
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
    this._$('.sg-wt-playpause').addEventListener('click', function () { self._wtAutoPlayToggle(); });
    this._$('.sg-wt-resume').addEventListener('click', function () {
      if (self.pendingResume) self._wtStart(self.pendingResume.id, self.pendingResume.stepIndex);
    });
    this._$('.sg-wt-restart').addEventListener('click', function () {
      if (self.pendingResume) self._wtStart(self.pendingResume.id, 0);
    });
    this._$('.sg-btn-mute').addEventListener('click', function () { self._ttsMuteToggle(); });
    this._$('.sg-btn-replay').addEventListener('click', function () { self._ttsReplay(); });
    this._updateMuteBtn();
    if (!this.cfg.ttsProxyUrl) {
      var ttsBar = this._$('.sg-tts-bar');
      if (ttsBar) ttsBar.hidden = true;
    }

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
    this._ttsStop();
    this._stopConversation();
    this._autoClear();
    this._demoStop();
    /* Save walkthrough progress so Resume works after minimizing */
    if (this.mode === 'walkthrough' && this.wt) {
      this.pendingResume = { id: this.wt.id, stepIndex: this.wt.stepIndex };
      this._ssSet('resume-id',   this.wt.id);
      this._ssSet('resume-step', String(this.wt.stepIndex));
      this.wt = null;
    }
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
    var self = this;
    this._setMode('text');
    this._$('.sg-input').focus();
    if (this.cfg.voiceAgentId) {
      this._startConversation(true).catch(function (e) {
        console.warn('[SomaGuide] text session pre-start error', e);
      });
    }
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
    this._ttsStop();
    this._stopConversation();
    this._autoClear();
    this._demoStop();
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
    /* Use strict number check so stepIndex=0 is honoured (not coerced to falsy) */
    this.wt = { id: id, stepIndex: typeof stepIndex === 'number' ? stepIndex : 0 };
    this._autoPlay = true;
    this._autoStopped = false;
    this.pendingResume = null;
    this._ssDel('resume-id');
    this._ssDel('resume-step');
    this._setMode('walkthrough');
    this._updateAutoPlayBtn();
    this._renderWtStep();
  };

  SomaGuide.prototype._renderWtStep = function () {
    if (!this.wt) return;
    var self = this;
    var wt   = this._wtById(this.wt.id);
    if (!wt) return;
    var step = wt.steps[this.wt.stepIndex];
    if (!step) return;

    if (step.page && typeof location !== 'undefined') {
      var currentFile = location.pathname.split('/').pop() || 'index.html';
      if (currentFile !== step.page) {
        this._ssSet('wt-id',   this.wt.id);
        this._ssSet('wt-step', String(this.wt.stepIndex));
        this._navigate(step.page);
        return;
      }
    }

    this._$('.sg-wt-narration').textContent  = step.narration || '';
    this._$('.sg-wt-instruction').textContent = step.instruction || '';

    var total  = wt.steps.length;
    var cur    = this.wt.stepIndex + 1;
    var isLast = cur >= total;
    this._$('.sg-wt-prog').textContent   = 'Step ' + cur + ' of ' + total;
    this._$('.sg-wt-next').textContent   = isLast ? 'Finish ✓' : 'Next →';

    this._clearHighlight();
    var targetEl = null;
    if (step.target) {
      targetEl = document.querySelector(step.target);
      if (targetEl) {
        var displayVal = (typeof window !== 'undefined' && window.getComputedStyle)
          ? window.getComputedStyle(targetEl).display : '';
        if (displayVal === 'inline') {
          targetEl.dataset.sgWasInline = '1';
        }
        targetEl.classList.add('sg-highlight');
        if (typeof targetEl.scrollIntoView === 'function') {
          targetEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }
    }

    /* Animated demo cursor */
    if (targetEl && step.demo) {
      this._demoMoveTo(targetEl, step.demo);
    } else {
      this._demoStop();
    }

    /* TTS + auto-advance: build onEnded callback when auto-play is active */
    this._autoClear();
    var onEnded = null;
    if (this._autoPlay && !this._autoStopped) {
      onEnded = function () {
        if (self._autoPlay && !self._autoStopped && self.wt) {
          self._wtNext();
        }
      };
    }
    this._ttsSpeak(step.narration || '', onEnded);
  };

  SomaGuide.prototype._wtNext = function () {
    if (!this.wt) return;
    var wt = this._wtById(this.wt.id);
    if (!wt) return;
    this._autoClear();
    this._demoStop();
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
    this._autoClear();
    this._demoStop();
    this._ssDel('wt-id');
    this._ssDel('wt-step');
    this._ssDel('resume-id');
    this._ssDel('resume-step');
    var done = this.cfg.persona.walkthroughDone || 'All done! Ask me anything.';
    this.wt = null;
    this.pendingResume = null;
    this._openIdle(false);
    this._$('.sg-greeting').textContent = done;
  };

  SomaGuide.prototype._wtExit = function () {
    this._autoClear();
    this._demoStop();
    if (this.wt) {
      this.pendingResume = { id: this.wt.id, stepIndex: this.wt.stepIndex };
      this._ssSet('resume-id',   this.wt.id);
      this._ssSet('resume-step', String(this.wt.stepIndex));
    }
    this._clearHighlight();
    this.wt = null;
    this._openIdle(false);
  };

  /* ── Auto-advance helpers ─────────────────────────────────────────────────── */

  SomaGuide.prototype._autoClear = function () {
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
  };

  SomaGuide.prototype._wtAutoPlayToggle = function () {
    var self = this;
    this._autoStopped = !this._autoStopped;
    this._updateAutoPlayBtn();
    if (this._autoStopped) {
      /* Pause: stop audio and cancel pending advance timer */
      this._autoClear();
      this._ttsStop();
    } else {
      /* Resume: re-narrate and re-arm auto-advance for the current step */
      if (self.wt) self._renderWtStep();
    }
  };

  SomaGuide.prototype._updateAutoPlayBtn = function () {
    var btn = this._$('.sg-wt-playpause');
    if (!btn) return;
    if (this._autoStopped) {
      btn.textContent = '▶';
      btn.setAttribute('title', 'Resume auto-play');
      btn.setAttribute('aria-label', 'Resume auto-play');
    } else {
      btn.textContent = '⏸';
      btn.setAttribute('title', 'Pause auto-play');
      btn.setAttribute('aria-label', 'Pause auto-play');
    }
  };

  /* ── Demo cursor ──────────────────────────────────────────────────────────── */

  SomaGuide.prototype._demoBuild = function () {
    if (this._demoCursor || typeof document === 'undefined') return;
    var el = document.createElement('div');
    el.className = 'sg-demo-cursor';
    /* SVG cursor arrow in the site's gold colour */
    el.innerHTML = '<svg width="20" height="24" viewBox="0 0 20 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M2 2L2 20L7 15L11 23L14 22L10 14L18 14Z" fill="#c9a84c" stroke="#060e18" stroke-width="1.5" stroke-linejoin="round"/></svg>';
    document.body.appendChild(el);
    this._demoCursor = el;
  };

  SomaGuide.prototype._demoStop = function () {
    if (this._demoCursorTimer) {
      clearTimeout(this._demoCursorTimer);
      this._demoCursorTimer = null;
    }
    if (this._demoCursor) {
      this._demoCursor.classList.remove('sg-demo-cursor--visible');
    }
  };

  SomaGuide.prototype._demoMoveTo = function (target, action) {
    var self = this;
    if (!target || typeof document === 'undefined') return;
    this._demoBuild();
    var cursor = this._demoCursor;
    if (!cursor) return;

    /* Target centre (approximate — JSDOM returns zeros, real browsers give coords) */
    var rect = target.getBoundingClientRect();
    var destX = Math.round(rect.left + rect.width * 0.5 - 10);
    var destY = Math.round(rect.top - 8);

    /* On first appearance: jump to near the widget with no transition */
    if (!cursor.classList.contains('sg-demo-cursor--visible')) {
      cursor.style.transition = 'none';
      var wx = (typeof window !== 'undefined' ? window.innerWidth  : 800) - 80;
      var wy = (typeof window !== 'undefined' ? window.innerHeight : 600) - 120;
      cursor.style.left = wx + 'px';
      cursor.style.top  = wy + 'px';
      cursor.classList.add('sg-demo-cursor--visible');
      /* Force reflow so starting position registers before transition re-enabled */
      cursor.getBoundingClientRect();
      cursor.style.transition = '';
    }

    /* Glide to target */
    cursor.style.left = destX + 'px';
    cursor.style.top  = destY + 'px';

    /* After glide (~700ms), perform the demo action */
    if (this._demoCursorTimer) clearTimeout(this._demoCursorTimer);
    this._demoCursorTimer = setTimeout(function () {
      self._demoCursorTimer = null;
      self._demoDoAction(target, action);
    }, 800);
  };

  SomaGuide.prototype._demoDoAction = function (target, action) {
    if (action === 'openDropdown') {
      /* Try clicking a toggle button within the target */
      var toggle = null;
      if (target.querySelector) {
        toggle = target.querySelector('[aria-expanded], .nav-dropdown-toggle, .dropdown-toggle');
      }
      if (!toggle && target.matches && target.matches('.nav-dropdown-toggle, .dropdown-toggle')) {
        toggle = target;
      }
      if (toggle) {
        toggle.click();
        /* Auto-close after display window */
        setTimeout(function () {
          if (toggle.getAttribute('aria-expanded') === 'true') toggle.click();
        }, 2500);
      } else {
        /* Fallback: add class to nearest dropdown container */
        var container = (target.closest && target.closest('.nav-dropdown, .dropdown')) || target.parentElement;
        if (container) {
          container.classList.add('sg-demo-open');
          setTimeout(function () { container.classList.remove('sg-demo-open'); }, 2500);
        }
      }
    } else if (action === 'click') {
      this._demoRipple();
    }
    /* 'hover' — cursor presence at the target is sufficient visual */
  };

  SomaGuide.prototype._demoRipple = function () {
    if (!this._demoCursor || typeof document === 'undefined') return;
    var rect = this._demoCursor.getBoundingClientRect();
    var ripple = document.createElement('div');
    ripple.className = 'sg-demo-ripple';
    ripple.style.left = (rect.left - 6) + 'px';
    ripple.style.top  = (rect.top  - 6) + 'px';
    document.body.appendChild(ripple);
    setTimeout(function () {
      if (ripple.parentNode) ripple.parentNode.removeChild(ripple);
    }, 700);
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
      if (el.dataset.sgWasInline) {
        delete el.dataset.sgWasInline;
      }
    });
  };

  /* ── ElevenLabs voice / text ──────────────────────────────────────────────── */

  SomaGuide.prototype._loadConvClass = function () {
    var self = this;
    if (self.ConvClass) return Promise.resolve(self.ConvClass);
    var esmUrl = self.cfg.voiceAgentEsmUrl || ELEVENLABS_ESM;
    var imp = (typeof global.__importStub === 'function')
      ? global.__importStub
      : function (u) { return import(u); };
    return imp(esmUrl).then(function (mod) {
      self.ConvClass = mod.Conversation;
      return self.ConvClass;
    });
  };

  SomaGuide.prototype._startConversation = function (textOnly) {
    var self = this;
    var agentId = this.cfg.voiceAgentId;
    if (!agentId) return Promise.reject(new Error('No voiceAgentId configured'));

    self._convConnected = false;
    self._convBuffer = null;

    return this._loadConvClass().then(function (Conversation) {
      return Conversation.startSession({
        agentId: agentId,
        textOnly: textOnly === true ? true : undefined,
        onConnect: function () {
          self._convConnected = true;
          if (self._convBuffer) {
            var buffered = self._convBuffer;
            self._convBuffer = null;
            try {
              if (self.conversation && typeof self.conversation.sendUserMessage === 'function') {
                self.conversation.sendUserMessage(buffered);
              }
            } catch (e) { console.warn('[SomaGuide] buffered send error', e); }
          }
        },
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
    this._convConnected = false;
    this._convBuffer = null;
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

    /* Intent: if question matches a walkthrough keyword, run the demo tour */
    var match = this._matchWalkthrough(text);
    if (match) {
      this._wtStart(match.id, 0);
      return;
    }

    var self = this;
    var send = function () {
      if (self.conversation) {
        if (self._convConnected) {
          return Promise.resolve(self.conversation.sendUserMessage(text));
        }
        self._convBuffer = text;
        return Promise.resolve();
      }
      return self._startConversation(true).then(function (conv) {
        if (self._convConnected) {
          return conv.sendUserMessage(text);
        }
        self._convBuffer = text;
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

  /* ── TTS narration ──────────────────────────────────────────────────────────── */

  SomaGuide.prototype._ttsEnabled = function () {
    return !!(this.cfg.ttsProxyUrl && this.cfg.voiceAgentId) && !this._ttsMuted;
  };

  SomaGuide.prototype._ttsStop = function () {
    if (this._ttsAudio) {
      this._ttsAudio.pause();
      this._ttsAudio.src = '';
      this._ttsAudio = null;
    }
  };

  /* _ttsSpeak(text, onEnded?)
   * onEnded: optional callback fired when audio finishes (or after fallback timer).
   * Used by _renderWtStep to drive auto-advance. Not passed by replay/mute paths. */
  SomaGuide.prototype._ttsSpeak = function (text, onEnded) {
    var self = this;
    this._ttsStop();
    var fallbackMs = Math.max(3500, (text || '').length * 45);
    if (!this._ttsEnabled() || !text) {
      /* No audio — schedule auto-advance via fallback timer if caller wants it */
      if (onEnded) {
        self._autoTimer = setTimeout(onEnded, fallbackMs);
      }
      return;
    }

    var url = this.cfg.ttsProxyUrl +
      '?action=tts' +
      '&text=' + encodeURIComponent(text) +
      '&agent_id=' + encodeURIComponent(this.cfg.voiceAgentId);

    var fetchFn = (typeof global !== 'undefined' && global.fetch) || fetch;
    fetchFn(url).then(function (r) {
      if (!r.ok) return null;
      return r.blob();
    }).then(function (blob) {
      if (!blob || !self._ttsEnabled()) {
        if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
        return;
      }
      var objUrl = (typeof URL !== 'undefined' && URL.createObjectURL)
        ? URL.createObjectURL(blob) : null;
      if (!objUrl) {
        if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
        return;
      }
      var audio = new Audio(objUrl);
      self._ttsAudio = audio;
      if (onEnded) {
        /* Fallback timer in case audio never fires 'ended' (decode error, browser block) */
        self._autoTimer = setTimeout(onEnded, fallbackMs + 2000);
        audio.addEventListener('ended', function () {
          /* Cancel fallback and advance — audio finished naturally */
          clearTimeout(self._autoTimer);
          self._autoTimer = null;
          onEnded();
        }, { once: true });
      }
      audio.play().catch(function () {
        /* Autoplay blocked — reschedule at nominal fallback delay */
        if (onEnded) {
          clearTimeout(self._autoTimer);
          self._autoTimer = setTimeout(onEnded, fallbackMs);
        }
      });
    }).catch(function (e) {
      console.warn('[SomaGuide] TTS error', e);
      if (onEnded) self._autoTimer = setTimeout(onEnded, fallbackMs);
    });
  };

  SomaGuide.prototype._ttsMuteToggle = function () {
    this._ttsMuted = !this._ttsMuted;
    this._lsSet('tts-muted', this._ttsMuted ? '1' : '0');
    this._updateMuteBtn();
    if (this._ttsMuted) {
      this._ttsStop();
    } else if (this.mode === 'walkthrough' && this.wt) {
      var wt = this._wtById(this.wt.id);
      if (wt) {
        var step = wt.steps[this.wt.stepIndex];
        if (step) this._ttsSpeak(step.narration || '');
      }
    }
  };

  SomaGuide.prototype._ttsReplay = function () {
    if (!this.wt) return;
    var wt = this._wtById(this.wt.id);
    if (!wt) return;
    var step = wt.steps[this.wt.stepIndex];
    if (step) this._ttsSpeak(step.narration || '');
  };

  SomaGuide.prototype._updateMuteBtn = function () {
    var btn = this._$('.sg-btn-mute');
    if (!btn) return;
    btn.textContent = this._ttsMuted ? '🔇' : '🔊';
    btn.setAttribute('title', this._ttsMuted ? 'Unmute narration' : 'Mute narration');
    btn.setAttribute('aria-label', this._ttsMuted ? 'Unmute narration' : 'Mute narration');
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
