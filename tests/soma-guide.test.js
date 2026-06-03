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
