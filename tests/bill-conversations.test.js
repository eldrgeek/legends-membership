/**
 * Bill conversation scenarios — the REAL engine + the REAL Bill config,
 * table-driven: "member types X → Bill must do Y".
 *
 * Routes:
 *   tour:<id>          a walkthrough starts
 *   feedback:bug/feature   the inline intake form renders
 *   deflect            scope-guard redirect
 *   inference          grounded answer from the knowledge endpoint
 *   conversation       falls through to the ElevenLabs agent
 *
 * Every entry in SCENARIOS is a regression contract. When one of these
 * breaks in production (e.g. "every question got the find-member tour",
 * 2026-06-10), add the failing utterance here first, then fix.
 *
 * Run: npm test
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { makeBillWindow, routeOf } = require('./helpers/bill-harness');

/* ── The routing contract ───────────────────────────────────────────────── */

const SCENARIOS = [
  /* Explicit tour requests still work */
  ['tour',                                        'tour:site-tour'],
  ['give me a tour',                              'tour:site-tour'],
  ['show me around',                              'tour:site-tour'],
  ['walk me through the site please',             'tour:site-tour'],
  ['how do i find a member',                      'tour:find-member'],
  ['where can i find a member?',                  'tour:find-member'],
  ['how do I use ask bill',                       'tour:ask-bill-walkthrough'],

  /* THE 2026-06-10 REGRESSION CLASS: ordinary questions must NOT be
   * hijacked into canned tours. They go to inference (grounded answer). */
  ['Who is Greg Foster?',                         'inference'],
  ['What are the player benefits?',               'inference'],
  ['What is on the committee page?',              'inference'],
  ['What is SOMA?',                               'inference'],
  ['Who are the members of the committee?',       'inference'],
  ['Tell me about the five pillars',              'inference'],
  ['Is there a meeting this month?',              'inference'],
  ['Can I update my member profile?',             'inference'],

  /* Messages that merely contain tour-ish words must not start tours */
  ['I took a tour of the arena last year and loved talking with the players', 'conversation'],
  ['My grandson wants to chat about basketball with a real legend',           'conversation'],

  /* Feedback intake — must win even when the message mentions a page */
  ['report a bug',                                'feedback:bug'],
  ['I found a bug on the committee page',         'feedback:bug'],
  ['something is broken on the minutes page',     'feedback:bug'],
  ['the systems map page is not working',         'feedback:bug'],
  ['feature request',                             'feedback:feature'],
  ['I have a suggestion for the resources page',  'feedback:feature'],
  ['it would be great if profiles had stats',     'feedback:feature'],

  /* Scope guard */
  ['What is the weather in Chicago?',             'deflect'],
  ['write me a poem about basketball',            'deflect'],
  ['tell me a joke',                              'deflect'],
  ['What is the latest news today?',              'deflect'],

  /* Everything else flows to the conversational agent */
  ['Thanks Bill, you have been very helpful!',    'conversation'],
  ['My name is Leslie',                           'conversation'],
];

describe('Bill conversations — routing contract', () => {
  for (const [message, expected] of SCENARIOS) {
    test(`"${message}" → ${expected}`, () => {
      assert.equal(routeOf(message), expected);
    });
  }
});

/* ── Feedback button end-to-end ─────────────────────────────────────────── */

describe('Bill conversations — feedback buttons', () => {
  test('🐛 Report a Bug: form renders, NO ElevenLabs greeting can interrupt', (_, done) => {
    const { win, makeGuide } = makeBillWindow();
    const g = makeGuide();
    g._openIdle(false);
    const btns = win.document.querySelectorAll('.sg-topic-btn--feedback');
    assert.equal(btns.length, 2, 'idle greeting must offer 💡 + 🐛 buttons');
    const bugBtn = Array.from(btns).find(b => b.textContent.includes('Bug'));
    bugBtn.click();
    setTimeout(() => {
      assert.equal(g.mode, 'text');
      const form = win.document.querySelector('.sg-feedback-form');
      assert.ok(form, 'bug form must render');
      assert.ok(form.querySelector('.sg-feedback-form-title').textContent.includes('Bug'));
      assert.equal(win._convStarts, 0,
        'voice session must not start — its scripted "what\'s your name?" greeting would hijack the flow');
      done();
    }, 30);
  });

  test('submitting the bug form POSTs to the Netlify function and confirms', (_, done) => {
    const { win, makeGuide } = makeBillWindow();
    const g = makeGuide();
    g._openText({ skipPreStart: true });
    g._startFeedbackFlow('bug', '');
    const form = win.document.querySelector('.sg-feedback-form');
    form.querySelector('.sg-feedback-textarea').value = 'The minutes page shows a blank table';
    form.querySelector('.sg-feedback-submit').click();
    setTimeout(() => {
      const fb = win._fetchCalls.find(f => f.url.includes('submit-feedback'));
      assert.ok(fb, 'must POST to the feedback function');
      const body = JSON.parse(fb.init.body);
      assert.equal(body.type, 'bug');
      assert.equal(body.description, 'The minutes page shows a blank table');
      assert.equal(body.assistant_id, 'legends-bill');
      const msgs = win.document.querySelectorAll('.sg-msg--agent .sg-msg-text');
      assert.ok(msgs[msgs.length - 1].textContent.includes('logged'),
        'Bill must confirm the report was logged');
      assert.equal(win.document.querySelector('.sg-feedback-form'), null,
        'form is removed after successful submit');
      done();
    }, 30);
  });

  test('typed "report a bug" pre-fills nothing (bare trigger phrase)', () => {
    const { win, makeGuide } = makeBillWindow();
    const g = makeGuide();
    g._openText({ skipPreStart: true });
    g._sendText('report a bug');
    const ta = win.document.querySelector('.sg-feedback-textarea');
    assert.equal(ta.value, '', 'bare trigger phrase must not be used as the description');
  });

  test('typed long bug description pre-fills the form', () => {
    const { win, makeGuide } = makeBillWindow();
    const g = makeGuide();
    g._openText({ skipPreStart: true });
    const msg = 'I found a bug: the assessment form loses my answers when I go back';
    g._sendText(msg);
    const ta = win.document.querySelector('.sg-feedback-textarea');
    assert.equal(ta.value, msg);
  });
});

/* ── Stop tour restores the starting state (real Bill tour) ─────────────── */

describe('Bill conversations — stop tour returns to start', () => {
  test('starting the site tour from another page records that page as origin', () => {
    /* Member was reading the resources page when they started the tour;
     * the tour's first step navigates to '/'. */
    const { makeGuide } = makeBillWindow({ url: 'http://localhost/resources.html' });
    const g = makeGuide();
    const navs = [];
    g._navigate = p => navs.push(p);
    g._wtStart('site-tour', 0, -1);
    assert.deepEqual(navs, ['/'], 'tour step 1 navigates home');
    assert.equal(g._ssGet('origin-path'), '/resources.html', 'origin recorded before navigating');
  });

  test('stopping the tour on a page the tour navigated to returns to the origin page', () => {
    /* This window represents the page AFTER the tour navigated home; the
     * origin key persisted in sessionStorage from the start page. */
    const { makeGuide } = makeBillWindow({ url: 'http://localhost/' });
    const g = makeGuide();
    const navs = [];
    g._navigate = p => navs.push(p);
    g._ssSet('origin-path', '/resources.html');
    g._ssSet('origin-scroll', '420');
    g._wtStart('site-tour', 0, -1);
    g._wtGoToNeutral();
    assert.equal(navs[navs.length - 1], '/resources.html',
      'Stop tour must navigate back to where the member started');
    assert.equal(g._ssGet('reopen-idle'), '1');
    assert.equal(g._ssGet('restore-scroll'), '420');
    assert.equal(g._ssGet('resume-id'), null, 'no dangling resume state');
  });

  test('stopping on the origin page restores scroll and shows the menu', () => {
    const { win, makeGuide } = makeBillWindow({ url: 'http://localhost/index.html' });
    const g = makeGuide();
    const scrolls = [];
    win.scrollTo = (x, y) => scrolls.push(y);
    g._navigate = () => {};
    /* find-member step 1 has no page → stays on index */
    g._wtStart('find-member', 0, -1);
    g._ssSet('origin-scroll', '300');
    g._wtGoToNeutral();
    assert.equal(g.mode, 'idle');
    assert.equal(scrolls[scrolls.length - 1], 300, 'scroll restored');
    assert.equal(win.document.querySelector('.sg-wt-bar').hidden, true);
    assert.ok(!win.document.querySelector('.sg-highlight'), 'no highlight left behind');
    assert.ok(!win.document.querySelector('.sg-demo-open'), 'no dropdown left open');
  });
});

/* ── Voice input ────────────────────────────────────────────────────────── */

describe('Bill conversations — voice input', () => {
  test('mic button stays hidden when the browser lacks SpeechRecognition', () => {
    const { win, makeGuide } = makeBillWindow();
    makeGuide();
    assert.equal(win.document.querySelector('.sg-mic').hidden, true);
  });

  test('mic button appears when SpeechRecognition exists', () => {
    const { win, makeGuide } = makeBillWindow();
    win.eval(`
      window.SpeechRecognition = function () {
        this.start = function () {}; this.stop = function () {};
      };
    `);
    makeGuide();
    assert.equal(win.document.querySelector('.sg-mic').hidden, false,
      'voice input mic must be offered in text chat');
  });

  test('voice mode button exists in the header (ElevenLabs path)', () => {
    const { win, makeGuide } = makeBillWindow();
    makeGuide();
    assert.ok(win.document.querySelector('.sg-btn-voice'));
    assert.ok(win.document.querySelector('.sg-orb'), 'tap-to-speak orb present');
  });
});

/* ── Inference offers a guided follow-up ────────────────────────────────── */

describe('Bill conversations — answer + offer to show', () => {
  test('a question related to a tour gets an answer AND a "show me" button', (_, done) => {
    const { win, makeGuide } = makeBillWindow();
    const g = makeGuide();
    g._openText({ skipPreStart: true });
    g._sendText('What is the member directory?');
    setTimeout(() => {
      const msgs = win.document.querySelectorAll('.sg-msg--agent .sg-msg-text');
      assert.equal(msgs[msgs.length - 1].textContent, 'Grounded answer from Bill.');
      assert.ok(win.document.querySelector('.sg-show-me-btn'),
        'related find-member walkthrough should be offered after the answer');
      done();
    }, 50);
  });
});
