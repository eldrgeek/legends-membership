/* Tour-video lightbox — Legends of Basketball
 * --------------------------------------------
 * "Show, don't tell": narrated walkthrough videos hosted on the site itself
 * (videos/*.mp4, produced by ~/Projects/demo-producer). Any element carrying
 * `data-tour-video` becomes a trigger that opens a modal lightbox with a
 * plain <video controls> — NO autoplay, ever. Built for a 60+ audience:
 * big play affordance on the card, a labeled Close button (not a bare ×),
 * Escape / backdrop-click to close, and a large-type clickable chapter list.
 *
 * Chapters: each video ships a WebVTT chapters file (`data-tour-chapters`).
 * We attach it as <track kind="chapters"> for semantics, but no mainstream
 * browser renders chapter navigation in default <video> controls — so the
 * real chapter UX is the clickable list rendered under the video (seek +
 * play on click, active chapter highlighted on timeupdate). Deliberate call;
 * see tests/tour-video.test.js.
 *
 * Trigger contract (all attributes on the trigger element):
 *   data-tour-video     — mp4 URL (required)
 *   data-tour-poster    — poster image URL
 *   data-tour-chapters  — WebVTT chapters URL
 *   data-tour-title     — heading shown above the video
 *
 * Auth-aware triggers reuse the site's data-auth-gate mechanism
 * (js/auth-visibility.js): a gated trigger ships display:none and is
 * revealed for signed-in users. This module doesn't touch auth at all.
 *
 * Authored 2026-07-03 by Dee (Claude Code) for Mike Wolf — WQ-82,
 * Show-Don't-Tell reference implementation.
 */
(function () {
  'use strict';

  // ── VTT chapter parsing (pure; exposed for tests) ──────────────────
  function parseTimestamp(ts) {
    var m = /^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(ts.trim());
    if (!m) return null;
    var h = m[1] ? parseInt(m[1], 10) : 0;
    var frac = m[4] ? parseFloat('0.' + m[4]) : 0;
    return h * 3600 + parseInt(m[2], 10) * 60 + parseInt(m[3], 10) + frac;
  }

  function parseVtt(text) {
    var cues = [];
    if (!/^WEBVTT/.test(String(text).trim())) return cues;
    var blocks = String(text).replace(/\r/g, '').split(/\n\n+/);
    blocks.forEach(function (block) {
      var lines = block.split('\n').filter(function (l) { return l.trim() !== ''; });
      for (var i = 0; i < lines.length; i++) {
        var t = /^(.+?)\s+-->\s+(.+?)(?:\s|$)/.exec(lines[i]);
        if (t) {
          var start = parseTimestamp(t[1]);
          var end = parseTimestamp(t[2]);
          var title = lines.slice(i + 1).join(' ').trim();
          if (start !== null && title) cues.push({ start: start, end: end, title: title });
          break;
        }
      }
    });
    return cues;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60);
    var s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  // ── Lightbox (built once, reused) ──────────────────────────────────
  var box = null;
  var lastTrigger = null;
  var currentCues = []; // chapters of the tour currently loaded in the lightbox

  function build() {
    box = document.createElement('div');
    box.className = 'tour-lightbox';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.style.display = 'none';
    box.innerHTML =
      '<div class="tour-lightbox-backdrop" data-tour-close></div>' +
      '<div class="tour-lightbox-panel">' +
      '  <div class="tour-lightbox-bar">' +
      '    <h2 class="tour-lightbox-title"></h2>' +
      '    <button type="button" class="tour-lightbox-close" data-tour-close aria-label="Close video">Close &#10005;</button>' +
      '  </div>' +
      '  <video controls preload="metadata" playsinline></video>' +
      '  <div class="tour-chapters" style="display:none;">' +
      '    <div class="tour-chapters-heading">Jump to a section</div>' +
      '    <ol class="tour-chapters-list"></ol>' +
      '  </div>' +
      '</div>';
    document.body.appendChild(box);

    box.addEventListener('click', function (e) {
      if (e.target.hasAttribute && e.target.hasAttribute('data-tour-close')) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && box.style.display !== 'none') close();
    });

    // ONE module-level timeupdate handler for the lifetime of the lightbox.
    // renderChapters() only swaps `currentCues`; wiring a fresh listener per
    // render stacked handlers with stale cue closures across tours (Ren
    // review 2026-07-04) — items[i] went undefined when cue counts differed.
    var video = box.querySelector('video');
    video.addEventListener('timeupdate', function () {
      if (!currentCues.length) return;
      var t = video.currentTime;
      var items = box.querySelectorAll('.tour-chapters-list .tour-chapter');
      currentCues.forEach(function (cue, i) {
        if (!items[i]) return;
        var active = t >= cue.start && (cue.end == null || t < cue.end);
        items[i].classList.toggle('active', active);
      });
    });
  }

  function renderChapters(cues) {
    var wrap = box.querySelector('.tour-chapters');
    var list = box.querySelector('.tour-chapters-list');
    var video = box.querySelector('video');
    list.innerHTML = '';
    currentCues = cues; // the build()-wired timeupdate handler reads this
    if (!cues.length) { wrap.style.display = 'none'; return; }
    cues.forEach(function (cue) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'tour-chapter';
      btn.innerHTML = '<span class="tour-chapter-time">' + formatTime(cue.start) + '</span> ' +
        '<span class="tour-chapter-title"></span>';
      btn.querySelector('.tour-chapter-title').textContent = cue.title;
      btn.addEventListener('click', function () {
        video.currentTime = cue.start + 0.01;
        video.play(); // explicit user intent — not autoplay
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    wrap.style.display = '';
  }

  function open(trigger) {
    if (!box) build();
    lastTrigger = trigger;
    var video = box.querySelector('video');
    var title = box.querySelector('.tour-lightbox-title');
    var src = trigger.getAttribute('data-tour-video');
    var chaptersUrl = trigger.getAttribute('data-tour-chapters');

    title.textContent = trigger.getAttribute('data-tour-title') || 'Video tour';
    box.setAttribute('aria-label', title.textContent);
    if (video.getAttribute('src') !== src) {
      video.setAttribute('src', src);
      if (trigger.getAttribute('data-tour-poster')) {
        video.setAttribute('poster', trigger.getAttribute('data-tour-poster'));
      } else {
        video.removeAttribute('poster');
      }
      // Semantic chapters track (see header note on why the visible list is primary).
      var old = video.querySelector('track');
      if (old) old.remove();
      if (chaptersUrl) {
        var track = document.createElement('track');
        track.kind = 'chapters';
        track.src = chaptersUrl;
        track.srclang = 'en';
        track.default = true;
        video.appendChild(track);
      }
      box.querySelector('.tour-chapters').style.display = 'none';
      currentCues = []; // new video: no active chapters until its VTT arrives
      if (chaptersUrl && typeof fetch === 'function') {
        fetch(chaptersUrl).then(function (r) { return r.text(); }).then(function (text) {
          renderChapters(parseVtt(text));
        }).catch(function () { /* chapters are enhancement only */ });
      }
    }
    box.style.display = '';
    document.body.classList.add('tour-lightbox-open');
    var closeBtn = box.querySelector('.tour-lightbox-close');
    if (closeBtn && closeBtn.focus) closeBtn.focus();
  }

  function close() {
    if (!box) return;
    var video = box.querySelector('video');
    if (video && !video.paused) video.pause();
    box.style.display = 'none';
    document.body.classList.remove('tour-lightbox-open');
    if (lastTrigger && lastTrigger.focus) lastTrigger.focus();
  }

  function wire() {
    document.querySelectorAll('[data-tour-video]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        e.preventDefault();
        open(el);
      });
    });
  }

  // Exposed for unit tests.
  window.LegendsTourVideo = {
    parseVtt: parseVtt,
    parseTimestamp: parseTimestamp,
    formatTime: formatTime,
    open: open,
    close: close,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
