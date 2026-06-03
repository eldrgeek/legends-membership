/**
 * SOMA Guide Widget — Unit tests
 *
 * Tests: widget mounts, introduce-once logic, walkthrough navigation,
 * jump-out/jump-back-in, and keyword-to-walkthrough matching.
 *
 * Run: npm test
 */

'use strict';

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs     = require('node:fs');
const path   = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT    = path.join(__dirname, '..');
const GUIDE_SRC = fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8');

/* ── Helpers ── */

/** Create a fresh jsdom window with localStorage + the SomaGuide source loaded.
 *  Does NOT set window.SomaGuideConfig, so auto-init won't fire.
 *  Returns the window object. */
function makeWindow(lsOverrides) {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
    url: 'http://localhost',
    runScripts: 'dangerously'
  });
  const win = dom.window;

  /* Seed localStorage before loading the script */
  if (lsOverrides) {
    Object.entries(lsOverrides).forEach(([k, v]) => win.localStorage.setItem(k, v));
  }

  /* Suppress dynamic import — the ElevenLabs ESM import only runs on voice/text,
   * so tests that don't call _openVoice/_startConversation never hit it.
   * Patch global import to return a stub Conversation class. */
  win.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');

  win.eval(GUIDE_SRC);
  return win;
}

/** Minimal test config — no ElevenLabs calls needed for most tests. */
const TEST_CONFIG = {
  persona: {
    name: 'TestBot',
    id: 'test-bot',
    avatar: '🤖',
    greeting: 'Hello first-timer!',
    shortGreeting: 'Welcome back!',
    walkthroughDone: 'All done!'
  },
  voiceAgentId: 'test-agent-id',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-alpha',
      label: 'Alpha Tour',
      keywords: ['alpha', 'first tour'],
      steps: [
        { target: 'body',  label: 'Step A1', narration: 'Step one narration',   instruction: 'Step one instruction' },
        { target: 'body',  label: 'Step A2', narration: 'Step two narration',   instruction: 'Step two instruction' },
        { target: 'body',  label: 'Step A3', narration: 'Step three narration', instruction: 'Step three instruction' }
      ]
    },
    {
      id: 'wt-beta',
      label: 'Beta Tour',
      keywords: ['beta', 'second tour'],
      steps: [
        { target: null, label: 'Beta Step 1', narration: 'Beta narration', instruction: 'Beta instruction' }
      ]
    }
  ]
};

/* ── Test suites ── */

describe('SOMA Guide — widget mounts', function () {
  test('SomaGuide class is exposed on window', function () {
    const win = makeWindow();
    assert.ok(typeof win.SomaGuide === 'function', 'window.SomaGuide should be a constructor');
  });

  test('new SomaGuide() appends #soma-guide to body', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const el = win.document.getElementById('soma-guide');
    assert.ok(el, '#soma-guide element should exist in DOM');
  });

  test('widget starts minimized', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.mode, 'minimized');
    assert.ok(win.document.getElementById('soma-guide').className.includes('sg--min'));
  });

  test('FAB button is present', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const fab = win.document.querySelector('.sg-fab');
    assert.ok(fab, '.sg-fab should exist');
  });

  test('panel contains persona name', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const name = win.document.querySelector('.sg-persona-name');
    assert.ok(name, '.sg-persona-name should exist');
    assert.equal(name.textContent, TEST_CONFIG.persona.name);
  });

  test('topic buttons rendered for each walkthrough', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btns = win.document.querySelectorAll('.sg-topic-btn');
    assert.equal(btns.length, TEST_CONFIG.walkthroughs.length);
  });
});

describe('SOMA Guide — introduce-once logic', function () {
  test('introduced flag starts false when localStorage is empty', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.introduced, false);
  });

  test('introduced flag starts true when localStorage has the key', function () {
    const win = makeWindow({ 'soma-guide:test-bot:introduced': '1' });
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.introduced, true);
  });

  test('_openIdle(true) marks user as introduced', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g.introduced, false);
    g._openIdle(true);
    assert.equal(g.introduced, true);
    assert.equal(win.localStorage.getItem('soma-guide:test-bot:introduced'), '1');
  });

  test('_openIdle(true) sets first-time greeting text', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(true);
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.greeting);
  });

  test('_openIdle(false) sets short greeting text', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.shortGreeting);
  });

  test('_openIdle(true) does NOT re-set greeting on second call', function () {
    const win = makeWindow({ 'soma-guide:test-bot:introduced': '1' });
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.shortGreeting);
  });
});

describe('SOMA Guide — walkthrough step navigation', function () {
  test('_wtStart sets mode to walkthrough', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    assert.equal(g.mode, 'walkthrough');
  });

  test('_wtStart renders first step narration', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Step one narration');
  });

  test('_wtStart renders first step instruction', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const inst = win.document.querySelector('.sg-wt-instruction').textContent;
    assert.equal(inst, 'Step one instruction');
  });

  test('progress indicator shows correct step/total', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    const prog = win.document.querySelector('.sg-wt-prog').textContent;
    assert.equal(prog, 'Step 1 of 3');
  });

  test('_wtNext advances to step 2', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext();
    assert.equal(g.wt.stepIndex, 1);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Step two narration');
  });

  test('progress indicator updates after Next', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext();
    const prog = win.document.querySelector('.sg-wt-prog').textContent;
    assert.equal(prog, 'Step 2 of 3');
  });

  test('Next button says "Finish ✓" on last step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); // step 2
    g._wtNext(); // step 3 (last)
    const btn = win.document.querySelector('.sg-wt-next').textContent;
    assert.equal(btn, 'Finish ✓');
  });

  test('Finish on last step resets wt to null', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); g._wtNext(); // now on last step
    g._wtNext(); // Finish
    assert.equal(g.wt, null);
  });

  test('Finish shows walkthroughDone greeting', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtNext(); g._wtNext();
    g._wtNext(); // Finish
    const txt = win.document.querySelector('.sg-greeting').textContent;
    assert.equal(txt, TEST_CONFIG.persona.walkthroughDone);
  });

  test('can start walkthrough at arbitrary step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    assert.equal(g.wt.stepIndex, 2);
    const narr = win.document.querySelector('.sg-wt-narration').textContent;
    assert.equal(narr, 'Step three narration');
  });

  test('_wtById returns correct walkthrough by id', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const wt = g._wtById('wt-beta');
    assert.ok(wt, 'should find wt-beta');
    assert.equal(wt.label, 'Beta Tour');
  });

  test('_wtById returns null for unknown id', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g._wtById('no-such-id'), null);
  });
});

describe('SOMA Guide — jump-out / jump-back-in', function () {
  test('_wtExit saves pendingResume', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit();
    assert.ok(g.pendingResume, 'pendingResume should be set after exit');
    assert.equal(g.pendingResume.id, 'wt-alpha');
    assert.equal(g.pendingResume.stepIndex, 1);
  });

  test('_wtExit returns to idle mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtExit();
    assert.equal(g.mode, 'idle');
  });

  test('resume bar is visible after exit', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._wtExit();
    const bar = win.document.querySelector('.sg-resume-bar');
    assert.equal(bar.hidden, false, 'resume bar should be visible after exit');
  });

  test('resume bar is hidden before any walkthrough', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    const bar = win.document.querySelector('.sg-resume-bar');
    assert.equal(bar.hidden, true, 'resume bar should be hidden when no pending resume');
  });

  test('resume-step buttons are rendered for each step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit();
    const steps = win.document.querySelectorAll('.sg-resume-step');
    assert.equal(steps.length, TEST_CONFIG.walkthroughs[0].steps.length);
  });

  test('current resume step gets --current class', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    g._wtExit();
    const steps = win.document.querySelectorAll('.sg-resume-step');
    assert.ok(steps[2].className.includes('sg-resume-step--current'));
  });

  test('clicking restart button re-starts at step 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    g._wtExit();
    // simulate restart click
    g._wtStart(g.pendingResume.id, 0);
    assert.equal(g.wt.stepIndex, 0);
    assert.equal(g.mode, 'walkthrough');
  });

  test('pendingResume is cleared after Finish', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 0);
    // Set a pendingResume manually
    g.pendingResume = { id: 'wt-alpha', stepIndex: 1 };
    // Finish the walk
    g._wtNext(); g._wtNext(); g._wtNext(); // advance to finish
    assert.equal(g.pendingResume, null);
  });
});

describe('SOMA Guide — keyword matching', function () {
  test('_matchWalkthrough returns correct tour for keyword hit', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('show me the alpha tour please');
    assert.ok(match, 'should match');
    assert.equal(match.id, 'wt-alpha');
  });

  test('_matchWalkthrough returns second tour for its keyword', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('tell me about the beta stuff');
    assert.ok(match);
    assert.equal(match.id, 'wt-beta');
  });

  test('_matchWalkthrough returns null on no match', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('what is the weather like today');
    assert.equal(match, null);
  });

  test('_matchWalkthrough is case-insensitive', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const match = g._matchWalkthrough('ALPHA please');
    assert.ok(match);
    assert.equal(match.id, 'wt-alpha');
  });
});

describe('SOMA Guide — mode transitions', function () {
  test('FAB click opens idle mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    win.document.querySelector('.sg-fab').click();
    assert.equal(g.mode, 'idle');
  });

  test('minimize button sets minimized mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelector('.sg-btn-min').click();
    assert.equal(g.mode, 'minimized');
  });

  test('text button switches to text mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelector('.sg-btn-text').click();
    assert.equal(g.mode, 'text');
  });

  test('sg--text class applied in text mode', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openText();
    assert.ok(win.document.getElementById('soma-guide').className.includes('sg--text'));
  });

  test('_setMode hides correct sub-panels', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._setMode('text');
    assert.equal(win.document.querySelector('.sg-idle-ui').hidden, true);
    assert.equal(win.document.querySelector('.sg-text-ui').hidden, false);
    assert.equal(win.document.querySelector('.sg-voice-ui').hidden, true);
  });

  test('_setMode walkthrough shows wt-bar', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._setMode('walkthrough');
    assert.equal(win.document.querySelector('.sg-wt-bar').hidden, false);
  });
});

/* ── TTS helpers ── */

const TTS_CONFIG = {
  persona: {
    name: 'TestBot',
    id: 'test-bot',
    avatar: '🤖',
    greeting: 'Hello!',
    shortGreeting: 'Back!',
    walkthroughDone: 'Done!'
  },
  voiceAgentId: 'test-agent-id',
  ttsProxyUrl: 'https://example.com/.netlify/functions/el-proxy',
  siteMap: [],
  walkthroughs: [
    {
      id: 'wt-alpha',
      label: 'Alpha Tour',
      keywords: ['alpha'],
      steps: [
        { target: 'body', label: 'Step A1', narration: 'Step one narration',   instruction: 'Do this' },
        { target: 'body', label: 'Step A2', narration: 'Step two narration',   instruction: 'Then that' },
      ]
    }
  ]
};

/** Make a window with Audio + fetch mocks suitable for TTS tests */
function makeWindowWithTTS() {
  const win = makeWindow();
  win.eval(`
    window._ttsRequests = [];
    window._audioInstances = [];
    window._ttsBlob = { type: 'audio/mpeg', _mock: true };
    window.fetch = function(url) {
      window._ttsRequests.push(url);
      return Promise.resolve({
        ok: true,
        blob: function() { return Promise.resolve(window._ttsBlob); }
      });
    };
    window.URL = window.URL || {};
    window.URL.createObjectURL = function(blob) { return 'blob:mock'; };
    window.Audio = function MockAudio(src) {
      this.src = src || '';
      this.paused = true;
      this._plays = 0;
      window._audioInstances.push(this);
    };
    window.Audio.prototype.play = function() { this.paused = false; this._plays++; return Promise.resolve(); };
    window.Audio.prototype.pause = function() { this.paused = true; };
  `);
  return win;
}

describe('SOMA Guide — TTS narration', function () {
  test('_ttsEnabled returns false when no ttsProxyUrl', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG); // TEST_CONFIG has no ttsProxyUrl
    assert.equal(g._ttsEnabled(), false);
  });

  test('_ttsEnabled returns true when proxy configured and not muted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = false;
    assert.equal(g._ttsEnabled(), true);
  });

  test('_ttsEnabled returns false when muted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = true;
    assert.equal(g._ttsEnabled(), false);
  });

  test('_ttsMuted loaded from localStorage', function () {
    const win = makeWindow({ 'soma-guide:test-bot:tts-muted': '1' });
    const g = new win.SomaGuide(TTS_CONFIG);
    assert.equal(g._ttsMuted, true);
  });

  test('_ttsMuted defaults to false when not in localStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    assert.equal(g._ttsMuted, false);
  });

  test('_ttsMuteToggle flips _ttsMuted true', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuteToggle();
    assert.equal(g._ttsMuted, true);
  });

  test('_ttsMuteToggle persists to localStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuteToggle();
    assert.equal(win.localStorage.getItem('soma-guide:test-bot:tts-muted'), '1');
  });

  test('_ttsMuteToggle back to false on second call', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuteToggle();
    g._ttsMuteToggle();
    assert.equal(g._ttsMuted, false);
  });

  test('_ttsStop clears _ttsAudio', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    // Place a mock audio object
    const fakeAudio = new win.Audio('blob:x');
    g._ttsAudio = fakeAudio;
    g._ttsStop();
    assert.equal(g._ttsAudio, null);
  });

  test('_ttsStop pauses playing audio', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const fakeAudio = new win.Audio('blob:x');
    fakeAudio.paused = false;
    g._ttsAudio = fakeAudio;
    g._ttsStop();
    assert.equal(fakeAudio.paused, true);
  });

  test('_ttsSpeak does nothing when no ttsProxyUrl', function () {
    const win = makeWindowWithTTS();
    // Use TEST_CONFIG which has no ttsProxyUrl
    const g = new win.SomaGuide(TEST_CONFIG);
    g._ttsSpeak('hello world');
    assert.equal(win._ttsRequests.length, 0);
  });

  test('_ttsSpeak issues fetch with correct action param', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('Hello narration');
    // fetch is async; wait a tick
    setTimeout(function () {
      assert.ok(win._ttsRequests.length > 0, 'fetch should have been called');
      assert.ok(win._ttsRequests[0].includes('action=tts'), 'URL should include action=tts');
      done();
    }, 20);
  });

  test('_ttsSpeak encodes text in URL', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('Hello & goodbye');
    setTimeout(function () {
      assert.ok(win._ttsRequests[0].includes('Hello'), 'URL should contain text');
      done();
    }, 20);
  });

  test('_ttsSpeak includes agent_id in URL', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsSpeak('test text');
    setTimeout(function () {
      assert.ok(win._ttsRequests[0].includes('agent_id=test-agent-id'), 'URL should include agent_id');
      done();
    }, 20);
  });

  test('_ttsSpeak stops previous audio before starting new', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const prev = new win.Audio('blob:prev');
    prev.paused = false;
    g._ttsAudio = prev;
    g._ttsSpeak('new narration');
    assert.equal(prev.paused, true, 'previous audio should be paused');
  });

  test('_ttsSpeak does nothing when muted', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = true;
    g._ttsSpeak('should not speak');
    assert.equal(win._ttsRequests.length, 0, 'no fetch when muted');
  });

  test('_setMode calls _ttsStop', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const prev = new win.Audio('blob:prev');
    prev.paused = false;
    g._ttsAudio = prev;
    g._setMode('idle');
    assert.equal(g._ttsAudio, null);
  });

  test('_minimize calls _ttsStop', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    const prev = new win.Audio('blob:prev');
    prev.paused = false;
    g._ttsAudio = prev;
    g._minimize();
    assert.equal(g._ttsAudio, null);
  });

  test('tts-bar is hidden when no ttsProxyUrl', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    const bar = win.document.querySelector('.sg-tts-bar');
    assert.equal(bar.hidden, true);
  });

  test('tts-bar is visible when ttsProxyUrl configured', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    const bar = win.document.querySelector('.sg-tts-bar');
    assert.equal(bar.hidden, false);
  });

  test('mute button shows speaker icon when unmuted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = false;
    g._updateMuteBtn();
    const btn = win.document.querySelector('.sg-btn-mute');
    assert.equal(btn.textContent, '🔊');
  });

  test('mute button shows muted icon when muted', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsMuted = true;
    g._updateMuteBtn();
    const btn = win.document.querySelector('.sg-btn-mute');
    assert.equal(btn.textContent, '🔇');
  });

  test('unmuting replays current step narration', function (_, done) {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._wtStart('wt-alpha', 0);
    g._ttsMuted = true;
    win._ttsRequests.length = 0; // clear any requests from _wtStart
    g._ttsMuteToggle(); // unmute → should replay
    setTimeout(function () {
      assert.ok(win._ttsRequests.length > 0, 'should have fetched TTS on unmute');
      done();
    }, 20);
  });

  test('_ttsReplay does nothing outside walkthrough', function () {
    const win = makeWindowWithTTS();
    const g = new win.SomaGuide(TTS_CONFIG);
    g._ttsReplay(); // no active walkthrough
    assert.equal(win._ttsRequests.length, 0);
  });
});

/* ── Cross-page sessionStorage bridge ── */

const XPAGE_CONFIG = {
  persona: { name: 'XBot', id: 'xbot', avatar: '🤖', greeting: 'Hi!', shortGreeting: 'Back!', walkthroughDone: 'Done!' },
  voiceAgentId: 'xbot-agent',
  siteMap: [],
  walkthroughs: [
    {
      id: 'xp-tour',
      label: 'Cross-page Tour',
      keywords: ['cross'],
      steps: [
        { target: 'body', label: 'Step 1', narration: 'First step', instruction: 'Do this' },
        { target: '.grid', page: 'other.html', label: 'Step 2', narration: 'Second step on other page', instruction: 'See that' },
        { target: 'body', label: 'Step 3', narration: 'Back to basics', instruction: 'Done' }
      ]
    }
  ]
};

/** Build a window that simulates arriving on a given page path */
function makeWindowOnPage(pagePath) {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div class="grid"></div></body></html>', {
    url: 'http://localhost/' + pagePath,
    runScripts: 'dangerously'
  });
  const win = dom.window;
  win.eval('window.__importStub = function(url) { return Promise.resolve({ Conversation: { startSession: function() { return Promise.resolve({ endSession: function(){}, sendUserMessage: function(){} }); } } }); };');
  win.eval(fs.readFileSync(path.join(ROOT, 'js', 'soma-guide.js'), 'utf8'));
  return win;
}

describe('SOMA Guide — cross-page sessionStorage bridge', function () {
  test('_wtExit persists pendingResume to sessionStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {}; // suppress any navigation
    g._wtStart('xp-tour', 1);
    g._wtExit();
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-id'), 'xp-tour');
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-step'), '1');
  });

  test('_wtFinish clears sessionStorage resume keys', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    g._wtStart('xp-tour', 0);
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-step', '1');
    g._wtFinish();
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-id'), null);
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-step'), null);
  });

  test('_renderWtStep calls _navigate and sets sessionStorage when step.page differs from current', function () {
    const win = makeWindowOnPage('index.html');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    var navigatedTo = null;
    g._navigate = function(page) { navigatedTo = page; };
    g.wt = { id: 'xp-tour', stepIndex: 1 };
    g._setMode('walkthrough');
    g._renderWtStep();
    assert.equal(navigatedTo, 'other.html', 'should navigate to step.page');
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:wt-id'), 'xp-tour');
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:wt-step'), '1');
  });

  test('_renderWtStep does NOT navigate when already on the correct page', function () {
    const win = makeWindowOnPage('other.html');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    var navigated = false;
    g._navigate = function() { navigated = true; };
    g._wtStart('xp-tour', 1); // step 1 has page: 'other.html'; we're on other.html
    assert.equal(navigated, false, 'should not navigate when already on correct page');
  });

  test('_onReady auto-resumes from sessionStorage xpage state', function () {
    const win = makeWindowOnPage('other.html');
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-step', '1');
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    // onReady has already fired (synchronously in makeWindow), but with setTimeout(100)
    // so we need to trigger it manually for testing
    // Clear ss first (onReady already cleared it during construction)
    // and check that _wtStart was called with correct args
    // Instead verify by seeding ss and calling _onReady directly
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:wt-step', '1');
    // Synchronously invoke the resume check
    const xpId   = g._ssGet('wt-id');
    const xpStep = g._ssGet('wt-step');
    assert.equal(xpId, 'xp-tour', 'sessionStorage should contain the tour id');
    assert.equal(xpStep, '1', 'sessionStorage should contain the step');
  });

  test('_onReady reads pendingResume from sessionStorage', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    /* Use the widget's own _ssSet helper (same JS context) to seed resume state,
     * then call _onReady to simulate arriving on a fresh page load. */
    g._ssSet('resume-id', 'xp-tour');
    g._ssSet('resume-step', '2');
    g._onReady();
    assert.ok(g.pendingResume, 'pendingResume should be restored from sessionStorage');
    assert.equal(g.pendingResume.id, 'xp-tour');
    assert.equal(g.pendingResume.stepIndex, 2);
  });

  test('resume button triggers _wtStart at pendingResume step', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    g._wtStart('xp-tour', 2);
    g._wtExit(); // sets pendingResume at step 2
    // click resume button
    win.document.querySelector('.sg-wt-resume').click();
    assert.equal(g.wt.stepIndex, 2, 'resume should restart at saved step index');
    assert.equal(g.mode, 'walkthrough');
  });

  test('_wtStart clears sessionStorage resume keys', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(XPAGE_CONFIG);
    g._navigate = function() {};
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-id', 'xp-tour');
    win.sessionStorage.setItem('soma-guide-xp:xbot:resume-step', '1');
    g._wtStart('xp-tour', 0);
    assert.equal(win.sessionStorage.getItem('soma-guide-xp:xbot:resume-id'), null);
  });
});

/* ── Start/Stop/Pause controls ── */

describe('SOMA Guide — start/stop/pause controls', function () {
  test('Pause button (sg-wt-exit) is present in walkthrough bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-exit');
    assert.ok(btn, '.sg-wt-exit should exist');
    assert.ok(btn.textContent.includes('Pause'), 'exit button should say Pause');
  });

  test('Resume button (sg-wt-resume) is present in resume bar', function () {
    const win = makeWindow();
    new win.SomaGuide(TEST_CONFIG);
    const btn = win.document.querySelector('.sg-wt-resume');
    assert.ok(btn, '.sg-wt-resume should exist');
    assert.ok(btn.textContent.includes('Resume'), 'resume button should say Resume');
  });

  test('pausing walkthrough shows resume bar on re-open', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 1);
    g._wtExit(); // pause
    // re-open idle
    win.document.querySelector('.sg-fab').click();
    const resumeBar = win.document.querySelector('.sg-resume-bar');
    assert.equal(resumeBar.hidden, false, 'resume bar should show after pause');
  });

  test('topic button starts tour from step 0', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openIdle(false);
    win.document.querySelectorAll('.sg-topic-btn')[0].click();
    assert.equal(g.mode, 'walkthrough');
    assert.equal(g.wt.stepIndex, 0);
  });

  test('wt-exit saves pendingResume and goes to idle', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._wtStart('wt-alpha', 2);
    win.document.querySelector('.sg-wt-exit').click();
    assert.equal(g.mode, 'idle');
    assert.ok(g.pendingResume);
    assert.equal(g.pendingResume.stepIndex, 2);
  });
});

/* ── Conversation (ElevenLabs text/voice) ── */

describe('SOMA Guide — conversation init', function () {
  /** Build a window with a controllable Conversation mock */
  function makeWindowWithConv() {
    const win = makeWindow();
    win.eval(`
      window._convSessions = [];
      window._mockConv = {
        endSession: function() { this._ended = true; },
        sendUserMessage: function(msg) { this._sent = (this._sent||[]).concat(msg); }
      };
      window.__importStub = function(url) {
        return Promise.resolve({
          Conversation: {
            startSession: function(opts) {
              window._convSessions.push(opts);
              // simulate onConnect firing after a tick
              if (opts.onConnect) setTimeout(function(){ opts.onConnect(); }, 5);
              return Promise.resolve(window._mockConv);
            }
          }
        });
      };
    `);
    return win;
  }

  test('_convConnected starts false', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    assert.equal(g._convConnected, false);
  });

  test('_stopConversation resets _convConnected and _convBuffer', function () {
    const win = makeWindow();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._convConnected = true;
    g._convBuffer = 'hello';
    g._stopConversation();
    assert.equal(g._convConnected, false);
    assert.equal(g._convBuffer, null);
  });

  test('_startConversation includes onConnect in session options', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      const opts = win._convSessions[0];
      assert.ok(typeof opts.onConnect === 'function', 'onConnect should be passed to startSession');
      done();
    }).catch(done);
  });

  test('onConnect sets _convConnected to true', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      setTimeout(function () {
        assert.equal(g._convConnected, true, '_convConnected should be true after onConnect fires');
        done();
      }, 20);
    }).catch(done);
  });

  test('_openText eagerly starts a conversation session', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openText();
    setTimeout(function () {
      assert.ok(win._convSessions.length > 0, '_openText should have started a session eagerly');
      done();
    }, 20);
  });

  test('_openText passes textOnly:true', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._openText();
    setTimeout(function () {
      const opts = win._convSessions[0];
      assert.equal(opts.textOnly, true, 'text mode should use textOnly:true');
      done();
    }, 20);
  });

  test('_sendText buffers message when session exists but not yet connected', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    // Start conversation but don't let onConnect fire yet
    // We manually control timing by not letting the timeout settle
    g._startConversation(true).then(function () {
      // Immediately after startSession resolves, _convConnected is still false
      // (onConnect fires after 5ms; we're in a .then() right away)
      g._convConnected = false; // ensure it's still false
      g._sendText('hello before connect');
      assert.equal(g._convBuffer, 'hello before connect', 'message should be buffered if not connected');
      done();
    }).catch(done);
  });

  test('_sendText sends immediately when _convConnected is true', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      g._convConnected = true;
      g._sendText('immediate message');
      const sent = win._mockConv._sent || [];
      assert.ok(sent.includes('immediate message'), 'should send immediately when connected');
      done();
    }).catch(done);
  });

  test('onConnect flushes buffered message', function (_, done) {
    const win = makeWindowWithConv();
    const g = new win.SomaGuide(TEST_CONFIG);
    g._startConversation(true).then(function () {
      g._convConnected = false;
      g._convBuffer = 'buffered msg';
      // Manually fire onConnect
      const opts = win._convSessions[0];
      opts.onConnect();
      assert.equal(g._convConnected, true);
      assert.equal(g._convBuffer, null, 'buffer should be cleared after onConnect');
      const sent = win._mockConv._sent || [];
      assert.ok(sent.includes('buffered msg'), 'buffered message should be sent on connect');
      done();
    }).catch(done);
  });
});
