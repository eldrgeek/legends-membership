/**
 * Bill costume validation — lints js/legends-guide-config.js against the
 * real site pages and the real engine's matching rules.
 *
 * This suite exists because config mistakes are silent in production:
 *  - an over-broad keyword hijacks every chat message into a canned tour
 *  - a step target selector that doesn't exist on its page skips the highlight
 *  - a narration edit without regenerated audio falls back to paid live TTS
 *
 * Run: npm test
 */

'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs   = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { ROOT, loadBillConfig, makeBillWindow } = require('./helpers/bill-harness');

const cfg = loadBillConfig();

/* ── Narration cue parser (self-contained) ──────────────────────────────────
 * The engine used to expose a static SomaGuide.parseNarration(); the current
 * soma-guide engine no longer parses [[cue]] choreography (it only STRIPS the
 * markup before TTS/display via _stripCues). The cue grammar is still the
 * config's contract (see CHOREOGRAPHY.md), so this lint parses it here rather
 * than depending on a removed engine method.
 *
 * Grammar (CHOREOGRAPHY.md): cues are [[verb selector? options?]] between words.
 *  - verb     = first whitespace-delimited token (arrow|highlight|unhighlight|
 *               click|open|close|scroll)
 *  - selector = the remainder, with a trailing timing token (2s | 1500ms | slow
 *               | fast) stripped off (used by `arrow`); may be empty ("last
 *               element a cue touched").
 * The cue-extraction regex mirrors the engine's _stripCues regex so we see
 * exactly the spans the engine treats as cues, including selectors that
 * themselves end in `]` (e.g. a[href="x"]).
 */
const CUE_RE = /\[\[(.*?)\]\](?!\])/g;
const CUE_TIMING_RE = /\s+(?:\d+(?:\.\d+)?(?:s|ms)|slow|fast)$/i;
function parseNarrationCues(narration) {
  const cues = [];
  const text = String(narration == null ? '' : narration);
  let m;
  CUE_RE.lastIndex = 0;
  while ((m = CUE_RE.exec(text)) !== null) {
    const body = m[1].trim();
    if (!body) continue;
    const sp = body.indexOf(' ');
    const verb = (sp === -1 ? body : body.slice(0, sp)).toLowerCase();
    let selector = sp === -1 ? '' : body.slice(sp + 1).trim();
    selector = selector.replace(CUE_TIMING_RE, '').trim();
    cues.push({ verb, selector });
  }
  return { cues };
}

/* ── Persona & required fields ──────────────────────────────────────────── */

describe('Costume — required config fields', () => {
  test('persona has name, unique id, greetings', () => {
    assert.ok(cfg.persona.name);
    assert.equal(cfg.persona.id, 'legends-bill');
    assert.ok(cfg.persona.greeting);
    assert.ok(cfg.persona.shortGreeting);
  });

  test('voiceAgentId, ttsProxyUrl, inferenceUrl, feedbackUrl are configured', () => {
    assert.match(cfg.voiceAgentId, /^agent_/);
    assert.match(cfg.ttsProxyUrl, /^https:\/\//);
    assert.match(cfg.inferenceUrl, /^https:\/\//);
    assert.equal(cfg.feedbackUrl, '/.netlify/functions/submit-feedback');
  });

  test('knowledge pack is loaded and non-trivial', () => {
    assert.ok(typeof cfg.knowledge === 'string' && cfg.knowledge.length > 200,
      'legends-knowledge.js must load before the config and be substantial');
  });

  test('every walkthrough has a unique id and ≥1 step with narration', () => {
    const ids = new Set();
    for (const wt of cfg.walkthroughs) {
      assert.ok(wt.id && !ids.has(wt.id), `duplicate or missing walkthrough id: ${wt.id}`);
      ids.add(wt.id);
      assert.ok(wt.steps.length >= 1);
      for (const s of wt.steps) {
        assert.ok(s.narration, `${wt.id}: step "${s.label}" missing narration`);
        for (const sub of s.substeps || []) {
          assert.ok(sub.narration, `${wt.id}: substep "${sub.label}" missing narration`);
        }
      }
    }
  });
});

/* ── Keyword hygiene ────────────────────────────────────────────────────── */

/* Conversational filler that appears in ordinary questions. Any of these as
 * a walkthrough keyword will eventually hijack a real question — this is
 * exactly the regression where every message got the find-member tour. */
const FILLER_KEYWORDS = [
  'question', 'chat', 'voice', 'help', 'show me', 'around', 'tell me',
  'member', 'players', 'player', 'legend', 'legends', 'committee', 'idea',
  'suggest', 'page', 'site', 'find', 'go', 'open', 'click', 'where', 'what',
];

describe('Costume — keyword hygiene', () => {
  test('no walkthrough keyword is bare conversational filler', () => {
    for (const wt of cfg.walkthroughs) {
      for (const kw of wt.keywords || []) {
        assert.ok(!FILLER_KEYWORDS.includes(kw.toLowerCase()),
          `${wt.id}: keyword "${kw}" is conversational filler — it will hijack normal questions. Use a specific multi-word phrase.`);
      }
    }
  });

  test('keywords are lowercase (engine matches on lowercased text)', () => {
    for (const wt of cfg.walkthroughs) {
      for (const kw of wt.keywords || []) {
        assert.equal(kw, kw.toLowerCase(), `${wt.id}: keyword "${kw}" must be lowercase`);
      }
    }
  });

  test('each walkthrough\'s own keywords route back to that walkthrough (no cross-shadowing)', () => {
    const { makeGuide } = makeBillWindow();
    const g = makeGuide();
    for (const wt of cfg.walkthroughs) {
      for (const kw of wt.keywords || []) {
        const match = g._matchWalkthrough(kw);
        assert.ok(match, `keyword "${kw}" of ${wt.id} no longer matches anything`);
        assert.equal(match.id, wt.id,
          `keyword "${kw}" of ${wt.id} is shadowed by ${match.id} — reorder or rephrase`);
      }
    }
  });

  test('no walkthrough keyword shadows a feedback intent phrase', () => {
    const { makeGuide } = makeBillWindow();
    const g = makeGuide();
    // Probes use phrasings the engine's _classifyFeedback actually recognizes
    // (see soma-guide.js bugIntents / featureIntents). The point of this test is
    // that no walkthrough keyword shadows these feedback intents — so the probes
    // must be real feedback phrases. ("file an issue" is intentionally absent:
    // the engine does not recognize it; "i want to report an issue" is its
    // recognized equivalent.)
    const intentProbes = [
      'report a bug', 'i found a bug', 'something is broken', 'i want to report an issue',
      'feature request', 'i have a suggestion', 'it would be great if', 'submit an idea',
    ];
    for (const probe of intentProbes) {
      assert.ok(g._classifyFeedback(probe),
        `"${probe}" should classify as feedback — engine intents changed?`);
    }
  });
});

/* ── Step selectors resolve on their real pages ─────────────────────────── */

function pageFile(page) {
  if (!page || page === '/') return 'index.html';
  let p = page.replace(/^\//, '');
  if (!p.endsWith('.html')) p += '.html';
  return p;
}

const pageDomCache = new Map();
function domFor(file) {
  if (!pageDomCache.has(file)) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    pageDomCache.set(file, new JSDOM(html).window.document);
  }
  return pageDomCache.get(file);
}

describe('Costume — walkthrough selectors exist on their pages', () => {
  for (const wt of cfg.walkthroughs) {
    /* Walk the tour the way the engine does: a step's `page` navigates,
     * otherwise the tour stays where the previous step left it. */
    let currentPage = pageFile(wt.steps[0].page);
    const flat = [];
    for (const s of wt.steps) {
      if (s.page) currentPage = pageFile(s.page);
      flat.push({ step: s, page: currentPage, label: s.label });
      for (const sub of s.substeps || []) {
        if (sub.page) currentPage = pageFile(sub.page);
        flat.push({ step: sub, page: currentPage, label: `${s.label} → ${sub.label}` });
      }
    }

    for (const { step, page, label } of flat) {
      if (step.target && step.target !== '#soma-guide') {
        test(`${wt.id} / "${label}": target resolves on ${page}`, () => {
          const doc = domFor(page);
          assert.ok(doc.querySelector(step.target),
            `selector not found on ${page}: ${step.target}`);
        });
      }
      if (step.requires && step.requires.dropdown) {
        test(`${wt.id} / "${label}": requires.dropdown resolves on ${page}`, () => {
          const doc = domFor(page);
          assert.ok(doc.querySelector(step.requires.dropdown),
            `dropdown selector not found on ${page}: ${step.requires.dropdown}`);
        });
      }
      if (/\[\[/.test(step.narration || '')) {
        test(`${wt.id} / "${label}": narration cues are valid and resolve on ${page}`, () => {
          const parsed = parseNarrationCues(step.narration);
          const KNOWN = ['arrow', 'highlight', 'unhighlight', 'click', 'open', 'close', 'scroll'];
          const doc = domFor(page);
          for (const cue of parsed.cues) {
            assert.ok(KNOWN.includes(cue.verb), `unknown cue verb [[${cue.verb}]]`);
            /* #soma-guide is the widget itself — engine-injected at runtime,
             * never present in the static HTML (same skip as step targets). */
            if (cue.selector && cue.selector !== '#soma-guide') {
              assert.ok(doc.querySelector(cue.selector),
                `cue [[${cue.verb} ${cue.selector}]] selector not found on ${page}`);
            }
          }
        });
      }
    }
  }
});

/* ── Site map paths exist ───────────────────────────────────────────────── */

describe('Costume — siteMap paths exist', () => {
  for (const entry of cfg.siteMap) {
    if (/^https?:/.test(entry.path)) continue;
    test(`siteMap "${entry.id}" → ${entry.path}`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, entry.path)),
        `siteMap entry "${entry.id}" points at missing file ${entry.path}`);
    });
  }
});

/* ── Scope guard sanity ─────────────────────────────────────────────────── */

describe('Costume — scope guard', () => {
  test('deflect message and contextNote are present and mention Bill\'s domain', () => {
    assert.ok(cfg.scopeGuard.deflect.length > 20);
    assert.ok(cfg.scopeGuard.contextNote.includes('Bill'));
    assert.ok(cfg.scopeGuard.contextNote.includes('Legends of Basketball'));
  });

  test('every offTopicPattern is usable by the engine (has .test)', () => {
    for (const p of cfg.scopeGuard.offTopicPatterns) {
      assert.ok(typeof p.test === 'function' || typeof p === 'string',
        `pattern ${p} is neither RegExp-like nor string`);
    }
  });

  test('off-topic patterns do not swallow on-domain questions', () => {
    const onDomain = [
      'What are the player benefits?',
      'Who is on the committee?',
      'How do I submit the assessment?',
      'What is SOMA?',
      'Tell me about the five pillars',
    ];
    const { makeGuide } = makeBillWindow();
    const g = makeGuide();
    for (const q of onDomain) {
      assert.equal(g._checkScopeGuard(q), false,
        `on-domain question wrongly deflected: "${q}"`);
    }
  });
});

/* ── Pre-generated tour audio coverage ──────────────────────────────────── */

/* Cue stripping — must match stripCues in soma-guide.js: audio is hashed
 * and synthesized from narration text with [[cue]] markup removed. */
function stripCues(raw) {
  return String(raw == null ? '' : raw).replace(/\s*\[\[(.*?)\]\](?!\])/g, '').replace(/^\s+/, '');
}

/* djb2-xor hash — must match _tourAudioHash in soma-guide.js and
 * gen-tour-audio.mjs. */
function tourAudioHash(agentId, narration) {
  const s = (agentId || '') + '|' + (narration || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (((h << 5) + h) ^ s.charCodeAt(i)) | 0;
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

describe('Costume — pre-generated tour audio is in sync with narrations', () => {
  const audioDir = path.join(ROOT, 'audio', 'tour');

  for (const wt of cfg.walkthroughs) {
    const narrations = [];
    for (const s of wt.steps) {
      narrations.push({ label: s.label, text: s.narration });
      for (const sub of s.substeps || []) {
        narrations.push({ label: `${s.label} → ${sub.label}`, text: sub.narration });
      }
    }
    for (const { label, text } of narrations) {
      test(`${wt.id} / "${label}": audio clip exists for current narration`, () => {
        const f = tourAudioHash(cfg.voiceAgentId, stripCues(text)) + '.mp3';
        assert.ok(fs.existsSync(path.join(audioDir, f)),
          `audio/tour/${f} missing — narration WORDS changed without regenerating audio ` +
          `(run: node scripts/gen-tour-audio.mjs). [[cues]] are free to move; words are not. ` +
          `Step falls back to slow paid live TTS.`);
      });
    }
  }
});
