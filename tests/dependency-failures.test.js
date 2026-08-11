/**
 * DEPENDENCY-FAILURE MATRIX — the failure-path proof for Ask Bill.
 *
 * Ask Bill depends on a four-link chain:
 *   1. the soma-guide widget bundle      (was: soma-guide.netlify.app — 404 in
 *      production on 2026-08-11, undetected; now vendored same-origin)
 *   2. bill-talk.netlify.app             (full voice/text conversation surface)
 *   3. ElevenLabs                        (voice, via the bill-talk el-proxy)
 *   4. VPS /infer/ask                    (text inference)
 *
 * Every other test in this repo proves the HAPPY path. This one blocks each
 * dependency INDIVIDUALLY and asserts the intended degradation.
 *
 * THE CONTRACT — for every single-dependency outage:
 *   A. a member can still reach core content (nav + readable page body)
 *   B. a member can still submit a request  (bugs.html -> recommendations API)
 *   C. the degradation specific to that dependency is INTENTIONAL, not an
 *      accident of an undefined global.
 *
 * Voice and inference are allowed to degrade. Navigation, reading, and
 * submitting a request are not.
 *
 * Run: npm run test:dependency-failures
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { bootPage, mainText, navLinks, ROOT } = require('./helpers/dependency-harness.js');

const HTML_FILES = fs
  .readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'))
  .concat(
    fs.existsSync(path.join(ROOT, 'members'))
      ? fs.readdirSync(path.join(ROOT, 'members')).filter((f) => f.endsWith('.html')).map((f) => path.join('members', f))
      : []
  );

/* ── Shared contract assertions ─────────────────────────────────────────── */

/** A. Core content is reachable. */
async function assertCoreContentReachable(label, block) {
  const { document } = await bootPage('index.html', { block });
  const links = navLinks(document);
  const body = mainText(document);

  assert.ok(
    links.length >= 10,
    `[${label}] member lost site navigation — only ${links.length} nav links rendered`
  );
  assert.ok(
    body.length >= 500,
    `[${label}] member lost readable page content — main text was ${body.length} chars`
  );
  // The member must still be able to reach the pages that matter.
  for (const must of ['members', 'recommendations', 'resources']) {
    assert.ok(
      links.some((h) => h.includes(must)),
      `[${label}] nav no longer offers a route to "${must}"`
    );
  }
}

/** B. A member can still submit a request. */
async function assertCanSubmitRequest(label, block) {
  const { window, document, record } = await bootPage('bugs.html', { block, signedIn: true });

  const title = document.getElementById('bug-title');
  const body = document.getElementById('bug-body');
  const btn = document.getElementById('submit-btn');
  assert.ok(title && body && btn, `[${label}] the request form is not rendered`);
  assert.equal(
    typeof window.submitBug,
    'function',
    `[${label}] submitBug() is not defined — the form cannot be submitted`
  );

  title.value = 'Dependency outage smoke';
  body.value = 'Filed while a dependency was unreachable.';
  window.submitBug();

  // let the auth + fetch promise chain run
  await new Promise((r) => setTimeout(r, 60));

  const posted = record.fetches.find(
    (f) => f.url.includes('/api/recommendations') && f.method === 'POST'
  );
  assert.ok(
    posted,
    `[${label}] request submission never reached the recommendations API — ` +
      `member cannot file anything. Calls seen: ${JSON.stringify(record.fetches.map((f) => f.method + ' ' + f.url))}`
  );
}

/* ── CASE 0: the vendoring contract ─────────────────────────────────────── */

describe('CASE 0 — guide assets are same-origin (no third-party CDN in the chain)', () => {
  test('no HTML file references the soma-guide CDN', () => {
    const offenders = HTML_FILES.filter((f) =>
      fs.readFileSync(path.join(ROOT, f), 'utf8').includes('soma-guide.netlify.app')
    );
    assert.deepEqual(
      offenders,
      [],
      `these pages still load Ask Bill from the third-party CDN (404 in production ` +
        `on 2026-08-11): ${offenders.join(', ')}`
    );
  });

  test('the guide bundle is vendored in-repo and non-trivial', () => {
    for (const f of ['soma-guide.js', 'soma-guide.css']) {
      const p = path.join(ROOT, 'vendor', 'soma-guide', f);
      assert.ok(fs.existsSync(p), `vendored asset missing: vendor/soma-guide/${f}`);
      assert.ok(
        fs.statSync(p).size > 1000,
        `vendored asset looks like a stub: vendor/soma-guide/${f}`
      );
    }
  });

  test('provenance is recorded so a later session can detect drift', () => {
    const p = path.join(ROOT, 'vendor', 'soma-guide', 'PROVENANCE.txt');
    assert.ok(fs.existsSync(p), 'vendor/soma-guide/PROVENANCE.txt missing');
    const txt = fs.readFileSync(p, 'utf8');
    assert.match(txt, /[0-9a-f]{40}/, 'PROVENANCE.txt records no source commit SHA');
  });

  test('every page that loads the engine also loads the resilience layer', () => {
    const offenders = HTML_FILES.filter((f) => {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      return src.includes('vendor/soma-guide/soma-guide.js') &&
             !src.includes('legends-ask-bill-resilience.js');
    });
    assert.deepEqual(
      offenders,
      [],
      `these pages load the engine with no degradation layer behind it: ${offenders.join(', ')}`
    );
  });
});

/* ── CASE 1: the guide bundle is unreachable ────────────────────────────── */

describe('CASE 1 — guide bundle unreachable (the 2026-08-11 production outage)', () => {
  const BLOCK = ['guideBundle'];

  test('A. member can still reach core content', () => assertCoreContentReachable('guide bundle down', BLOCK));
  test('B. member can still submit a request', () => assertCanSubmitRequest('guide bundle down', BLOCK));

  test('C. the widget really is dead in this scenario (control)', async () => {
    const { window } = await bootPage('index.html', { block: BLOCK });
    assert.equal(
      typeof window.somaGuide,
      'undefined',
      'test is not actually blocking the bundle — window.somaGuide still exists'
    );
  });

  test('C. Ask Bill degrades to a working text path, not a dead button', async () => {
    const { window, document } = await bootPage('index.html', { block: BLOCK });

    const trigger = document.querySelector('#ask-bill-section button');
    assert.ok(trigger, 'the in-page Ask Bill button is missing entirely');

    trigger.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 60));

    const panel = document.querySelector('[data-ask-bill-panel]');
    assert.ok(
      panel,
      'clicking Ask Bill with the bundle down did NOTHING — no fallback surface. ' +
        'This is the accidental degradation the matrix exists to catch.'
    );
    assert.ok(
      panel.querySelector('[data-ask-bill-input]'),
      'the fallback surface has no way to type a question'
    );
    const link = panel.querySelector('a[href*="bill-talk"]');
    assert.ok(link, 'the fallback surface offers no route to the full Bill conversation');
  });

  test('C. the fallback still answers, and has a true offline floor', async () => {
    const { window, record } = await bootPage('index.html', { block: BLOCK });
    assert.ok(window.LegendsAskBill, 'window.LegendsAskBill (the degradation layer) is not present');

    // With only the bundle down, inference is still up and SHOULD be used —
    // a degraded member deserves the better answer, not an artificially
    // crippled one. What matters is that an answer arrives at all.
    const res = await window.LegendsAskBill.ask('How do I contact the committee?');
    assert.ok(res.answer && res.answer.length > 40, `no usable answer with the bundle down: "${res.answer}"`);

    // The floor: local retrieval is pure and makes ZERO network calls, so it
    // still works when every remote dependency is gone at once.
    const before = record.fetches.length;
    const offline = window.LegendsAskBill.localAnswer('How do I contact the committee?');
    assert.ok(offline && offline.length > 40, `offline floor answer was empty or trivial: "${offline}"`);
    assert.equal(
      record.fetches.length,
      before,
      'localAnswer() made a network call — it is not actually offline-capable'
    );
  });

  test('C. total blackout — every dependency down at once still answers', async () => {
    const { window } = await bootPage('index.html', {
      block: ['guideBundle', 'billTalk', 'elevenLabs', 'inference'],
    });
    assert.ok(window.LegendsAskBill, 'degradation layer missing under total blackout');
    const res = await window.LegendsAskBill.ask('What does the committee do?');
    assert.equal(res.source, 'local', 'blackout did not fall through to local knowledge');
    assert.ok(res.answer && res.answer.length > 40, `blackout produced no answer: "${res.answer}"`);
  });
});

/* ── CASE 2: bill-talk is unreachable ───────────────────────────────────── */

describe('CASE 2 — bill-talk.netlify.app unreachable', () => {
  const BLOCK = ['billTalk'];

  test('A. member can still reach core content', () => assertCoreContentReachable('bill-talk down', BLOCK));
  test('B. member can still submit a request', () => assertCanSubmitRequest('bill-talk down', BLOCK));

  test('C. in-page Ask Bill still answers without touching bill-talk', async () => {
    const { window, record } = await bootPage('index.html', { block: BLOCK });
    assert.ok(window.LegendsAskBill, 'degradation layer missing');

    const res = await window.LegendsAskBill.ask('When does the committee meet?');
    assert.ok(res.answer && res.answer.length > 20, 'no answer produced while bill-talk was down');

    const leaned = record.fetches.filter((f) => f.url.includes('bill-talk'));
    assert.deepEqual(
      leaned.map((f) => f.url),
      [],
      'the in-page text answer depended on bill-talk — a single outage takes out both surfaces'
    );
  });

  test('C. the nav link is not the only route to Bill', async () => {
    const { document } = await bootPage('index.html', { block: BLOCK });
    const navBill = document.querySelector('#ask-bill-nav a');
    assert.ok(navBill, 'Ask Bill nav entry missing');
    assert.ok(
      document.querySelector('#ask-bill-section button'),
      'the only route to Bill is the nav link that points at the dead host'
    );
  });
});

/* ── CASE 3: ElevenLabs is unreachable ──────────────────────────────────── */

describe('CASE 3 — ElevenLabs (voice) unreachable', () => {
  const BLOCK = ['elevenLabs'];

  test('A. member can still reach core content', () => assertCoreContentReachable('elevenlabs down', BLOCK));
  test('B. member can still submit a request', () => assertCanSubmitRequest('elevenlabs down', BLOCK));

  test('C. voice failure is announced and text keeps working', async () => {
    const { window } = await bootPage('index.html', { block: BLOCK });
    assert.ok(window.LegendsAskBill, 'degradation layer missing');

    // Voice attempt fails -> the layer must record it, not swallow it.
    await window.LegendsAskBill.speak('hello there');

    assert.equal(
      window.LegendsAskBill.voiceStatus(),
      'unavailable',
      'voice died silently — the member is never told why Bill stopped talking'
    );
    const notice = window.LegendsAskBill.textOnlyNotice();
    assert.ok(notice && /text/i.test(notice), `no text-only notice offered: "${notice}"`);

    const res = await window.LegendsAskBill.ask('What is the committee?');
    assert.ok(res.answer && res.answer.length > 20, 'text answers stopped working when voice died');
  });
});

/* ── CASE 4: VPS /infer/ask is unreachable ──────────────────────────────── */

describe('CASE 4 — VPS /infer/ask (inference) unreachable', () => {
  const BLOCK = ['inference'];

  test('A. member can still reach core content', () => assertCoreContentReachable('inference down', BLOCK));
  test('B. member can still submit a request', () => assertCanSubmitRequest('inference down', BLOCK));

  test('C. Ask Bill falls back to local knowledge instead of dead-ending', async () => {
    const { window } = await bootPage('index.html', { block: BLOCK });
    assert.ok(window.LegendsAskBill, 'degradation layer missing');

    const res = await window.LegendsAskBill.ask('What does the Membership Services Committee do?');

    assert.equal(res.source, 'local', `expected local fallback, got source "${res.source}"`);
    assert.ok(res.answer && res.answer.length > 40, `dead-ended with: "${res.answer}"`);
    assert.ok(
      !/try voice chat/i.test(res.answer),
      'fallback punts the member to voice chat, which may also be down — that is a dead end, not a fallback'
    );
  });

  test('C. the live widget upgrades its dead-end into a grounded answer', async () => {
    // This is the real production path now that the engine is vendored: the
    // widget loads fine, but the VPS is unreachable. Stock engine behaviour is
    // "can't reach the knowledge base — try voice chat", which is a dead end
    // when voice is also down. The bridge must replace it with real content.
    const { window, document } = await bootPage('index.html', { block: BLOCK });
    assert.ok(window.somaGuide, 'engine did not load — this case cannot be exercised');

    window.somaGuide.open();
    await new Promise((r) => setTimeout(r, 50));
    window.somaGuide._askInference('What does the Membership Services Committee do?');
    await new Promise((r) => setTimeout(r, 300));

    const msgs = document.querySelector('.sg-messages');
    assert.ok(msgs, 'widget rendered no message surface');
    const txt = msgs.textContent.replace(/\s+/g, ' ').trim();

    assert.ok(
      !/can't reach the knowledge base right now/.test(txt),
      'the widget still shows the stock dead-end message — the bridge did not apply'
    );
    assert.match(
      txt,
      /Membership Services Committee/i,
      'the upgraded answer contains no actual site knowledge'
    );
  });

  test('C. request submission does NOT ride on the inference endpoint', async () => {
    // /infer/ask and /api/recommendations are different services on the same
    // host; an inference outage must not take request intake with it.
    const { record } = await bootPage('bugs.html', { block: BLOCK, signedIn: true });
    assert.ok(
      !record.fetches.some((f) => f.url.includes('/infer/ask')),
      'the bug/request page calls the inference endpoint on load'
    );
  });
});

/* ── Drift guard: the vendored engine must keep the shape we patched ────── */

describe('drift guard — vendored engine still matches the resilience layer', () => {
  test('the engine still emits the inference dead-end string the layer upgrades', () => {
    const p = path.join(ROOT, 'vendor', 'soma-guide', 'soma-guide.js');
    if (!fs.existsSync(p)) {
      assert.fail('vendored engine missing — cannot verify the resilience hook still applies');
    }
    const src = fs.readFileSync(p, 'utf8');
    assert.ok(
      src.includes("can't reach the knowledge base right now"),
      'the vendored engine no longer emits the sentinel the resilience layer hooks. ' +
        'Re-check js/legends-ask-bill-resilience.js against the new bundle.'
    );
  });
});
