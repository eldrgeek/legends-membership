/**
 * tour-video.test.js — walkthrough videos ON the site (Show, Don't Tell).
 *
 * Mike's directive (2026-07-03, WQ-82): host the three demo-producer
 * walkthrough mp4s in the site itself and surface them where each audience
 * lives —
 *  1. Home page: ONE tour card near the hero CTA for visitors (site tour,
 *     6 min). NO autoplay; lightbox with a big play affordance.
 *  2. Signed-in committee members see BOTH the site tour and their
 *     committee tour (3 min) via the data-auth-gate reveal mechanism.
 *  3. The admin tour (3 min) lives on admin-changelog.html ONLY.
 *  4. Each video ships WebVTT chapters (<track kind="chapters">) generated
 *     from demo-producer segment timings, plus a clickable chapter list in
 *     the lightbox (default <video> controls render no chapter UI in any
 *     mainstream browser — the list is the real 60+ chapter UX).
 *
 * Authored 2026-07-03 by Dee (Claude Code) with Mike Wolf.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const TOUR_VIDEO_JS = fs.readFileSync(path.join(ROOT, 'js/tour-video.js'), 'utf8');

function read(page) {
  return fs.readFileSync(path.join(ROOT, page), 'utf8');
}

// The three tours: file basenames + chapter counts / total durations that
// must match the demo-producer segment mp4s that were concat'd
// (see demo-producer/scripts/gen-chapters.mjs). Totals in seconds ±1.
const TOURS = {
  'site-tour': { chapters: 14, total: 381.3 },       // visitor greg-cut (drops 08-minutes)
  'committee-tour': { chapters: 8, total: 198.6 },
  'admin-tour': { chapters: 6, total: 180.6 },
};

// ──────────────────────────────────────────────────────────────────────────────
// 1. Assets exist and are real (video, poster, chapters) for every tour.
// ──────────────────────────────────────────────────────────────────────────────

describe('videos/ — every tour ships mp4 + poster + WebVTT chapters', () => {
  for (const name of Object.keys(TOURS)) {
    test(`${name}: mp4 present and non-trivial`, () => {
      const st = fs.statSync(path.join(ROOT, 'videos', `${name}.mp4`));
      assert.ok(st.size > 5 * 1024 * 1024, `${name}.mp4 should be a real video (>5MB)`);
    });
    test(`${name}: poster frame present`, () => {
      const st = fs.statSync(path.join(ROOT, 'videos', `${name}-poster.jpg`));
      assert.ok(st.size > 10 * 1024, `${name}-poster.jpg should be a real frame (>10KB)`);
    });
    test(`${name}: chapters VTT present`, () => {
      assert.ok(fs.existsSync(path.join(ROOT, 'videos', `${name}.vtt`)));
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. WebVTT chapter files are well-formed and match the known video timings.
// ──────────────────────────────────────────────────────────────────────────────

function parseVttViaModule(text) {
  // Run the real parser from js/tour-video.js in a bare jsdom window.
  const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
  dom.window.eval(TOUR_VIDEO_JS);
  return dom.window.LegendsTourVideo.parseVtt(text);
}

describe('WebVTT chapters — well-formed, contiguous, correct totals', () => {
  for (const [name, spec] of Object.entries(TOURS)) {
    const raw = fs.readFileSync(path.join(ROOT, 'videos', `${name}.vtt`), 'utf8');

    test(`${name}.vtt: WEBVTT header + expected cue count`, () => {
      assert.ok(/^WEBVTT/.test(raw.trim()), 'must start with WEBVTT');
      const cues = parseVttViaModule(raw);
      assert.strictEqual(cues.length, spec.chapters,
        `${name} must have ${spec.chapters} chapters`);
    });

    test(`${name}.vtt: cues start at 0, contiguous, titled, total matches video`, () => {
      const cues = parseVttViaModule(raw);
      assert.strictEqual(cues[0].start, 0, 'first chapter starts at 0');
      for (let i = 0; i < cues.length; i++) {
        assert.ok(cues[i].end > cues[i].start, `cue ${i} must have positive duration`);
        assert.ok(cues[i].title.length > 2, `cue ${i} must carry a human title`);
        if (i > 0) {
          assert.ok(Math.abs(cues[i].start - cues[i - 1].end) < 0.01,
            `cue ${i} must start where cue ${i - 1} ends (contiguous chapters)`);
        }
      }
      const total = cues[cues.length - 1].end;
      assert.ok(Math.abs(total - spec.total) < 1,
        `${name} chapters must span ~${spec.total}s (got ${total.toFixed(3)})`);
    });
  }

  test('site-tour.vtt (greg-cut) skips the Minutes segment', () => {
    const raw = fs.readFileSync(path.join(ROOT, 'videos', 'site-tour.vtt'), 'utf8');
    assert.ok(!/Meeting Minutes/.test(raw),
      'the visitor cut drops the minutes segment (it showed a login wall)');
    assert.ok(/Systems Map/.test(raw), 'neighboring chapters survive the cut');
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 3. Home page — visitor sees ONE card; committee card is auth-gated.
// ──────────────────────────────────────────────────────────────────────────────

describe('index.html — tour cards near the hero CTA', () => {
  const html = read('index.html');
  const doc = new JSDOM(html).window.document;
  const triggers = doc.querySelectorAll('[data-tour-video]');

  test('exactly two triggers: site tour + committee tour', () => {
    assert.strictEqual(triggers.length, 2);
    const srcs = Array.from(triggers).map((el) => el.getAttribute('data-tour-video'));
    assert.deepStrictEqual(srcs.sort(),
      ['/videos/committee-tour.mp4', '/videos/site-tour.mp4']);
  });

  test('cards live inside the hero, adjacent to the CTA', () => {
    const hero = doc.querySelector('.hero');
    assert.ok(hero, 'hero must exist');
    triggers.forEach((el) => assert.ok(hero.contains(el), 'tour card must be in the hero'));
    assert.ok(hero.querySelector('.hero-cta'), 'hero CTA still present');
  });

  test('site-tour card is visible to visitors (NOT auth-gated)', () => {
    const site = doc.querySelector('[data-tour-video="/videos/site-tour.mp4"]');
    assert.ok(!site.hasAttribute('data-auth-gate'), 'site tour is for everyone');
    assert.notStrictEqual(site.style.display, 'none');
  });

  test('committee-tour card ships hidden behind data-auth-gate', () => {
    const comm = doc.querySelector('[data-tour-video="/videos/committee-tour.mp4"]');
    assert.ok(comm.hasAttribute('data-auth-gate'),
      'committee tour reveals on sign-in via js/auth-visibility.js');
    assert.strictEqual(comm.style.display, 'none', 'must ship hidden (no flash)');
  });

  test('every card carries poster, chapters, title, big play affordance', () => {
    triggers.forEach((el) => {
      const base = el.getAttribute('data-tour-video').replace('/videos/', '').replace('.mp4', '');
      assert.strictEqual(el.getAttribute('data-tour-poster'), `/videos/${base}-poster.jpg`);
      assert.strictEqual(el.getAttribute('data-tour-chapters'), `/videos/${base}.vtt`);
      assert.ok(el.getAttribute('data-tour-title'), 'lightbox heading required');
      assert.ok(el.querySelector('.tour-card-play'), 'big play affordance required (60+)');
      assert.ok(el.querySelector('img[src$="-poster.jpg"]'), 'poster thumbnail required');
      assert.strictEqual(el.tagName, 'BUTTON');
      assert.strictEqual(el.getAttribute('type'), 'button');
    });
  });

  test('durations named in the card labels (6 min site / 3 min committee)', () => {
    const site = doc.querySelector('[data-tour-video="/videos/site-tour.mp4"]');
    const comm = doc.querySelector('[data-tour-video="/videos/committee-tour.mp4"]');
    assert.match(site.textContent, /6 min/);
    assert.match(comm.textContent, /3 min/);
  });

  test('index.html loads js/tour-video.js', () => {
    assert.ok(html.includes('/js/tour-video.js'));
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 4. Admin tour — on admin-changelog.html ONLY, inside the admin-gated panel.
// ──────────────────────────────────────────────────────────────────────────────

describe('admin-changelog.html — admin tour card, admin panel only', () => {
  const html = read('admin-changelog.html');
  const doc = new JSDOM(html).window.document;

  test('exactly one trigger: the admin tour', () => {
    const triggers = doc.querySelectorAll('[data-tour-video]');
    assert.strictEqual(triggers.length, 1);
    assert.strictEqual(triggers[0].getAttribute('data-tour-video'), '/videos/admin-tour.mp4');
    assert.strictEqual(triggers[0].getAttribute('data-tour-chapters'), '/videos/admin-tour.vtt');
  });

  test('card lives inside #main-panel (rendered only after the admin check)', () => {
    const panel = doc.getElementById('main-panel');
    assert.ok(panel.contains(doc.querySelector('[data-tour-video]')));
    assert.strictEqual(panel.style.display, 'none', 'panel ships hidden pending auth');
  });

  test('admin-changelog.html loads js/tour-video.js', () => {
    assert.ok(html.includes('/js/tour-video.js'));
  });
});

describe('no other page carries a tour trigger', () => {
  const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'))
    .concat(fs.readdirSync(path.join(ROOT, 'members'))
      .filter((f) => f.endsWith('.html')).map((f) => path.join('members', f)));
  for (const page of pages) {
    if (page === 'index.html' || page === 'admin-changelog.html') continue;
    test(`${page}: no data-tour-video trigger`, () => {
      assert.ok(!read(page).includes('data-tour-video'),
        `${page} must not surface a tour card (home + admin changelog only)`);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────────
// 5. Lightbox behavior (jsdom, real js/tour-video.js).
// ──────────────────────────────────────────────────────────────────────────────

const SITE_VTT = fs.readFileSync(path.join(ROOT, 'videos', 'site-tour.vtt'), 'utf8');

function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const FIXTURE = `
  <!doctype html>
  <body>
    <button type="button" id="trigger"
            data-tour-video="/videos/site-tour.mp4"
            data-tour-poster="/videos/site-tour-poster.jpg"
            data-tour-chapters="/videos/site-tour.vtt"
            data-tour-title="Site tour — how this site works (6 minutes)">
      Play
    </button>
  </body>
`;

async function loadLightbox() {
  const dom = new JSDOM(FIXTURE, {
    url: 'https://legends-membership.netlify.app/index.html',
    runScripts: 'dangerously',
    beforeParse(window) {
      // jsdom media elements have no real playback — record intent instead.
      window.HTMLMediaElement.prototype.play = function () {
        this._testPlayed = true;
        this._testPaused = false;
        return Promise.resolve();
      };
      window.HTMLMediaElement.prototype.pause = function () {
        this._testPaused = true;
      };
      Object.defineProperty(window.HTMLMediaElement.prototype, 'paused', {
        get() { return this._testPaused !== false; },
        configurable: true,
      });
      window.fetch = () => Promise.resolve({ text: () => Promise.resolve(SITE_VTT) });
    },
  });
  dom.window.eval(TOUR_VIDEO_JS);
  await tick();
  return dom;
}

describe('tour-video.js lightbox', () => {
  test('parseVtt on the shipped site-tour.vtt yields the 14 titled chapters', () => {
    const cues = parseVttViaModule(SITE_VTT);
    assert.strictEqual(cues.length, 14);
    assert.strictEqual(cues[0].title, 'Site introduction');
    assert.strictEqual(cues[cues.length - 1].title, 'About & Contact');
  });

  test('formatTime renders m:ss', () => {
    const dom = new JSDOM('<!doctype html><body></body>', { runScripts: 'dangerously' });
    dom.window.eval(TOUR_VIDEO_JS);
    assert.strictEqual(dom.window.LegendsTourVideo.formatTime(0), '0:00');
    assert.strictEqual(dom.window.LegendsTourVideo.formatTime(381.293), '6:21');
  });

  test('click opens the dialog: video wired, NO autoplay, chapters listed', async () => {
    const dom = await loadLightbox();
    const doc = dom.window.document;
    doc.getElementById('trigger').click();
    await tick(); await tick();

    const box = doc.querySelector('.tour-lightbox');
    assert.ok(box, 'lightbox must be built');
    assert.notStrictEqual(box.style.display, 'none', 'lightbox visible');
    assert.strictEqual(box.getAttribute('role'), 'dialog');

    const video = box.querySelector('video');
    assert.strictEqual(video.getAttribute('src'), '/videos/site-tour.mp4');
    assert.strictEqual(video.getAttribute('poster'), '/videos/site-tour-poster.jpg');
    assert.ok(video.hasAttribute('controls'), 'native controls');
    assert.ok(!video.hasAttribute('autoplay'), 'NO autoplay — 60+ directive');
    assert.ok(!video._testPlayed, 'opening the lightbox must not start playback');

    const track = video.querySelector('track');
    assert.strictEqual(track.getAttribute('kind'), 'chapters');
    assert.strictEqual(track.getAttribute('src'), '/videos/site-tour.vtt');

    const chapters = box.querySelectorAll('.tour-chapter');
    assert.strictEqual(chapters.length, 14, 'clickable chapter list (primary chapter UX)');

    const closeBtn = box.querySelector('.tour-lightbox-close');
    assert.match(closeBtn.textContent, /Close/, 'labeled Close button, not a bare glyph (60+)');
  });

  test('chapter click seeks and plays (explicit intent)', async () => {
    const dom = await loadLightbox();
    const doc = dom.window.document;
    doc.getElementById('trigger').click();
    await tick(); await tick();

    const box = doc.querySelector('.tour-lightbox');
    const video = box.querySelector('video');
    const third = box.querySelectorAll('.tour-chapter')[2]; // Committee Members @ 67.133s
    third.click();
    assert.ok(Math.abs(video.currentTime - 67.143) < 0.1, `seeked (got ${video.currentTime})`);
    assert.ok(video._testPlayed, 'chapter click plays');
  });

  test('Escape closes and pauses; backdrop click closes; close button closes', async () => {
    const dom = await loadLightbox();
    const doc = dom.window.document;
    const trigger = doc.getElementById('trigger');

    trigger.click();
    await tick(); await tick();
    const box = doc.querySelector('.tour-lightbox');
    const video = box.querySelector('video');
    video.play();

    doc.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' }));
    assert.strictEqual(box.style.display, 'none', 'Escape closes');
    assert.ok(video._testPaused, 'closing pauses playback');

    trigger.click();
    assert.notStrictEqual(box.style.display, 'none');
    box.querySelector('.tour-lightbox-backdrop').click();
    assert.strictEqual(box.style.display, 'none', 'backdrop click closes');

    trigger.click();
    box.querySelector('.tour-lightbox-close').click();
    assert.strictEqual(box.style.display, 'none', 'Close button closes');
  });
});
