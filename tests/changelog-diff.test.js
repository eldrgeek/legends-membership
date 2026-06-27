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
