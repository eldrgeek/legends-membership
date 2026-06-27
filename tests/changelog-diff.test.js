'use strict';

// Unit tests for the PURE helpers in js/changelog-diff.js used by the change-log
// "what changed" review: buildReviewSummary (Quinn's accurate brief) and
// renderDiffHtml (the iframe srcdoc diff). No DOM mutation, no network — loaded
// the same way as soma-goals: eval the IIFE inside a jsdom realm, read the global.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..');
const SRC = fs.readFileSync(path.join(ROOT, 'js/changelog-diff.js'), 'utf8');

const { window } = new JSDOM('', { runScripts: 'outside-only' });
window.eval(SRC);
const CD = window.ChangelogDiff;

// A realistic small commit (modeled on the real GitHub response shape).
function smallCommit() {
  return {
    commit: { message: 'Scholarships: remove stats block\n\nLonger body text here.' },
    stats: { total: 37, additions: 0, deletions: 37 },
    files: [{
      filename: 'scholarships.html',
      status: 'modified',
      additions: 0,
      deletions: 37,
      patch: '@@ -130,43 +130,6 @@ <h2>Partnership</h2>\n-<div class="stats">x</div>\n context line'
    }]
  };
}

describe('buildReviewSummary', () => {
  test('falls back to description when no commit', () => {
    assert.equal(CD.buildReviewSummary(null, 'Make the header gold', 'T'), 'Make the header gold');
  });

  test('falls back to title when no commit and no description', () => {
    assert.equal(CD.buildReviewSummary(null, '', 'The title'), 'The title');
  });

  test('front-loads commit subject and files from real commit', () => {
    const s = CD.buildReviewSummary(smallCommit(), 'Remove the stats block per Greg', 'Scholarships tidy');
    assert.match(s, /Scholarships: remove stats block/);
    assert.match(s, /Files: scholarships\.html/);
    // Uses only the first line of a multi-line commit message.
    assert.doesNotMatch(s, /Longer body text/);
  });

  test('omits description when it just echoes the commit subject', () => {
    const c = smallCommit();
    const s = CD.buildReviewSummary(c, 'Scholarships: remove stats block', 'x');
    const occurrences = (s.match(/remove stats block/gi) || []).length;
    assert.equal(occurrences, 1);
  });

  test('caps a long file list', () => {
    const c = smallCommit();
    c.files = ['a', 'b', 'c', 'd', 'e', 'f'].map((n) => ({ filename: n + '.html', status: 'modified' }));
    const s = CD.buildReviewSummary(c, 'desc', 't');
    assert.match(s, /\+2 more/);
  });
});

describe('renderDiffHtml', () => {
  test('renders a full HTML doc with header, stats and file', () => {
    const html = CD.renderDiffHtml(smallCommit(), { sha: 'abc1234', description: 'd' });
    assert.match(html, /^<!DOCTYPE html>/);
    assert.match(html, /Scholarships: remove stats block/);
    assert.match(html, /1 file/);
    assert.match(html, /scholarships\.html/);
    assert.match(html, /View commit on GitHub/);
  });

  test('escapes HTML inside patches (no raw tags leak through)', () => {
    const html = CD.renderDiffHtml(smallCommit(), { sha: 'abc1234' });
    // The patch contains <div class="stats">; it must be escaped in diff lines.
    assert.match(html, /&lt;div class=&quot;stats&quot;&gt;/);
  });

  test('colors +/- and hunk lines via classes', () => {
    const html = CD.renderDiffHtml(smallCommit(), { sha: 'abc1234' });
    assert.match(html, /dl del/);   // the removed line
    assert.match(html, /dl hunk/);  // the @@ header
  });

  test('truncates very large patches with a GitHub link', () => {
    const big = [];
    for (let i = 0; i < CD.MAX_PATCH_LINES + 50; i++) big.push('+line ' + i);
    const c = {
      commit: { message: 'big' },
      stats: { additions: big.length, deletions: 0 },
      files: [{ filename: 'big.txt', status: 'added', additions: big.length, deletions: 0, patch: big.join('\n') }]
    };
    const html = CD.renderDiffHtml(c, { sha: 'deadbee' });
    assert.match(html, /view full file on GitHub/);
  });

  test('first file open, later files collapsed by default', () => {
    const c = {
      commit: { message: 'two files' },
      stats: { additions: 2, deletions: 0 },
      files: [
        { filename: 'one.html', status: 'modified', additions: 1, deletions: 0, patch: '+a' },
        { filename: 'two.html', status: 'modified', additions: 1, deletions: 0, patch: '+b' }
      ]
    };
    const html = CD.renderDiffHtml(c, { sha: 'x' });
    // First details has the `open` attribute, the second does not.
    const firstOpen = html.indexOf('<details class="file" open>');
    const plainCount = (html.match(/<details class="file">/g) || []).length;
    assert.ok(firstOpen !== -1, 'first file should be open');
    assert.equal(plainCount, 1, 'second file should be collapsed');
  });

  test('handles a commit with no files without throwing', () => {
    const html = CD.renderDiffHtml({ commit: { message: 'empty' }, stats: {}, files: [] }, { sha: 'x' });
    assert.match(html, /no file changes/);
  });

  test('renders a status badge for added/removed/renamed', () => {
    const c = {
      commit: { message: 'm' },
      stats: { additions: 1, deletions: 1 },
      files: [
        { filename: 'a', status: 'added', additions: 1, deletions: 0, patch: '+x' },
        { filename: 'b', status: 'removed', additions: 0, deletions: 1, patch: '-y' },
        { filename: 'c', status: 'renamed', additions: 0, deletions: 0, patch: '' }
      ]
    };
    const html = CD.renderDiffHtml(c, { sha: 'x' });
    assert.match(html, /b-added/);
    assert.match(html, /b-removed/);
    assert.match(html, /b-renamed/);
  });
});

describe('extractAddedSnippets', () => {
  test('pulls visible text from added HTML lines (tags/entities stripped)', () => {
    const file = {
      filename: 'transition-services.html',
      patch: '@@ -10,3 +10,5 @@ <section class="goals">\n'
        + '+    <li class="goal">Secure ongoing transition coaching for every Legend</li>\n'
        + '+    <li class="goal">Build a peer mentor network &amp; warm intros</li>\n'
        + ' <p>existing context line</p>'
    };
    const snips = CD.extractAddedSnippets(file);
    assert.ok(snips.length >= 2, 'should find both added goals');
    assert.ok(snips.some((s) => /Secure ongoing transition coaching for every Legend/.test(s)));
    // Entities decoded, tags gone.
    assert.ok(snips.some((s) => /Build a peer mentor network & warm intros/.test(s)));
    assert.ok(!snips.some((s) => /<li/.test(s)), 'tags must be stripped');
  });

  test('drops short / non-distinctive snippets below minLen', () => {
    const file = { patch: '+<span>ok</span>\n+<div>This is a long enough distinctive line</div>' };
    const snips = CD.extractAddedSnippets(file);
    assert.ok(snips.every((s) => s.length >= 12));
    assert.ok(snips.some((s) => /long enough distinctive line/.test(s)));
  });

  test('ignores the +++ file header line', () => {
    const file = { patch: '+++ b/page.html\n+<h2>A meaningful added heading here</h2>' };
    const snips = CD.extractAddedSnippets(file);
    assert.ok(!snips.some((s) => /b\/page\.html/.test(s)));
    assert.ok(snips.some((s) => /A meaningful added heading here/.test(s)));
  });

  test('pure removal yields no snippets (the no-match fallback signal)', () => {
    const file = { patch: '@@ -1,3 +1,0 @@\n-<div class="stats">Removed entirely</div>\n-<p>and more</p>' };
    assert.equal(CD.extractAddedSnippets(file).length, 0);
  });

  test('null / empty patch yields no snippets and never throws', () => {
    assert.equal(CD.extractAddedSnippets(null).length, 0);
    assert.equal(CD.extractAddedSnippets({}).length, 0);
    assert.equal(CD.extractAddedSnippets({ patch: '' }).length, 0);
  });

  test('sorts longest (most distinctive) first', () => {
    const file = {
      patch: '+<p>Short distinctive bit</p>\n'
        + '+<p>This is a considerably longer and more distinctive snippet of text</p>'
    };
    const snips = CD.extractAddedSnippets(file);
    assert.ok(snips[0].length >= snips[snips.length - 1].length);
    assert.match(snips[0], /considerably longer/);
  });
});

describe('pickPageFile', () => {
  test('matches the file by page basename (with/without .html)', () => {
    const commit = {
      files: [
        { filename: 'css/site.css' },
        { filename: 'transition-services.html' },
        { filename: 'index.html' }
      ]
    };
    assert.equal(CD.pickPageFile(commit, '/transition-services').filename, 'transition-services.html');
    assert.equal(CD.pickPageFile(commit, '/transition-services.html').filename, 'transition-services.html');
  });

  test('falls back to the first HTML file when no basename match', () => {
    const commit = { files: [{ filename: 'a.css' }, { filename: 'about.html' }] };
    assert.equal(CD.pickPageFile(commit, '/nope').filename, 'about.html');
  });

  test('falls back to the first file when no HTML file present', () => {
    const commit = { files: [{ filename: 'a.css' }, { filename: 'b.js' }] };
    assert.equal(CD.pickPageFile(commit, '/x').filename, 'a.css');
  });

  test('returns null for an empty commit', () => {
    assert.equal(CD.pickPageFile({ files: [] }, '/x'), null);
    assert.equal(CD.pickPageFile(null, '/x'), null);
  });
});

describe('stripHtml', () => {
  test('removes tags and decodes common entities', () => {
    assert.equal(CD.stripHtml('<b>Greg &amp; Mike</b> &mdash; goals'), 'Greg & Mike — goals');
    assert.equal(CD.stripHtml('plain text'), 'plain text');
    assert.equal(CD.stripHtml(null), '');
  });
});

