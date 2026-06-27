/* changelog-diff.js — pure helpers for the change-log "what changed" review.
 *
 * No DOM mutation, no network, no Supabase. Two responsibilities:
 *   1. buildReviewSummary(commit, description, title) — the accurate brief Quinn
 *      speaks, front-loaded from REAL commit data when present.
 *   2. renderDiffHtml(commit, opts) — a full <!DOCTYPE html> document string for
 *      the preview iframe srcdoc: commit header + per-file collapsible unified
 *      diffs with +/- coloring, HTML escaped, large patches truncated.
 *
 * Exposed as window.ChangelogDiff so admin-changelog.html and the jsdom unit
 * tests can both reach the pure functions. Everything here is deterministic and
 * side-effect free so it can be unit tested without booting the page.
 */
(function (global) {
  'use strict';

  var REPO = 'eldrgeek/legends-membership';
  var COMMIT_BASE = 'https://github.com/' + REPO + '/commit/';
  // Cap a single file's rendered patch so a giant file can't lock the iframe.
  var MAX_PATCH_LINES = 400;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // First line of a (possibly multi-paragraph) commit message, trimmed.
  function firstLine(msg) {
    var s = String(msg == null ? '' : msg).trim();
    var nl = s.indexOf('\n');
    return (nl === -1 ? s : s.slice(0, nl)).trim();
  }

  // Collapse internal whitespace and trim a fragment to a max length on a word
  // boundary, appending an ellipsis when cut.
  function tidy(s, max) {
    var t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
    if (!max || t.length <= max) return t;
    var cut = t.slice(0, max);
    var sp = cut.lastIndexOf(' ');
    if (sp > max * 0.6) cut = cut.slice(0, sp);
    return cut.replace(/[.,;:\-\s]+$/, '') + '…';
  }

  // List of changed filenames, basename only, de-duplicated, capped.
  function fileNames(commit, cap) {
    var files = (commit && commit.files) || [];
    var names = [];
    for (var i = 0; i < files.length; i++) {
      var fn = files[i] && files[i].filename;
      if (!fn) continue;
      var base = String(fn).split('/').pop();
      if (names.indexOf(base) === -1) names.push(base);
    }
    cap = cap || 4;
    if (names.length <= cap) return names.join(', ');
    return names.slice(0, cap).join(', ') + ' +' + (names.length - cap) + ' more';
  }

  /**
   * The brief Quinn speaks. The hosted engine condenses to ~220 chars, so we
   * front-load the most load-bearing facts: what the commit did, which files,
   * then the human description. When there is no commit we fall back to the
   * plain description/title so callers can use this uniformly.
   *
   * @param {object|null} commit  GitHub commit JSON ({commit:{message}, files, stats}) or null.
   * @param {string} description  Human description of the change request.
   * @param {string} [title]      Change-request title, used only as a last resort.
   * @returns {string}
   */
  function buildReviewSummary(commit, description, title) {
    var desc = String(description == null ? '' : description).trim();
    var ttl = String(title == null ? '' : title).trim();
    if (!commit || !commit.commit) {
      return desc || ttl;
    }
    var subject = firstLine(commit.commit.message);
    var files = fileNames(commit, 4);
    var parts = [];
    if (subject) parts.push(subject.replace(/[.\s]+$/, '') + '.');
    if (files) parts.push('Files: ' + files + '.');
    // Only add the description if it adds information beyond the commit subject.
    if (desc && desc.toLowerCase() !== subject.toLowerCase()) {
      parts.push(tidy(desc, 160));
    }
    var out = parts.join(' ').trim();
    return out || desc || ttl;
  }

  // Strip HTML tags and decode the handful of entities a page snippet is likely
  // to carry, leaving the human-visible text. Pure, defensive, never throws.
  function stripHtml(s) {
    var t = String(s == null ? '' : s);
    // Drop tags entirely (greedy-safe, non-nested).
    t = t.replace(/<[^>]*>/g, ' ');
    // Decode the common named/numeric entities so the visible text matches what
    // the rendered DOM actually contains.
    t = t.replace(/&nbsp;/gi, ' ')
         .replace(/&amp;/gi, '&')
         .replace(/&lt;/gi, '<')
         .replace(/&gt;/gi, '>')
         .replace(/&quot;/gi, '"')
         .replace(/&#39;/gi, "'")
         .replace(/&rsquo;|&#8217;/gi, '’')
         .replace(/&lsquo;|&#8216;/gi, '‘')
         .replace(/&rdquo;|&#8221;/gi, '”')
         .replace(/&ldquo;|&#8220;/gi, '“')
         .replace(/&mdash;|&#8212;/gi, '—')
         .replace(/&ndash;|&#8211;/gi, '–')
         .replace(/&hellip;|&#8230;/gi, '…')
         .replace(/&#(\d+);/g, function (_, n) {
           try { return String.fromCharCode(parseInt(n, 10)); } catch (e) { return ' '; }
         });
    return t.replace(/\s+/g, ' ').trim();
  }

  /**
   * From a single commit `file` object, pull the human-visible text snippets that
   * the change ADDED to the page — the strings we can later search for in the
   * rendered live page to locate where the change happened.
   *
   * We read the unified-diff `patch`, take lines starting with '+' (excluding the
   * '+++ ' file header), strip HTML tags/entities to the visible text, and keep
   * only snippets distinctive enough to find reliably (>= minLen visible chars).
   * Results are de-duplicated and sorted longest-first (most distinctive first),
   * so the caller can try the strongest snippet before weaker ones.
   *
   * Pure: no DOM, no network. A pure REMOVAL (deletions only) yields []  — that's
   * the signal the caller uses to fall back to a "removed content" note.
   *
   * @param {object|null} file    A commit file object ({ patch }).
   * @param {object} [opts]
   * @param {number} [opts.minLen=12]  Minimum visible-char length to keep.
   * @param {number} [opts.max=6]      Cap on returned snippets.
   * @returns {string[]} visible-text snippets, longest first.
   */
  function extractAddedSnippets(file, opts) {
    opts = opts || {};
    var minLen = typeof opts.minLen === 'number' ? opts.minLen : 12;
    var max = typeof opts.max === 'number' ? opts.max : 6;
    var patch = file && file.patch;
    if (!patch) return [];
    var lines = String(patch).split('\n');
    var seen = Object.create(null);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      // Added content lines start with a single '+'. Skip the '+++ ' header.
      if (ln.charAt(0) !== '+' || ln.indexOf('+++') === 0) continue;
      var visible = stripHtml(ln.slice(1));
      if (visible.length < minLen) continue;
      var key = visible.toLowerCase();
      if (seen[key]) continue;
      seen[key] = true;
      out.push(visible);
    }
    // Longest (most distinctive) first.
    out.sort(function (a, b) { return b.length - a.length; });
    if (out.length > max) out = out.slice(0, max);
    return out;
  }

  /**
   * Pick the commit `file` whose change we should highlight on a given page: the
   * file whose basename matches the page path, else the first HTML file, else the
   * first file. Pure; returns the file object or null.
   *
   * @param {object|null} commit  GitHub commit JSON.
   * @param {string} [pageHref]   Live-page path (e.g. "/transition-services").
   * @returns {object|null}
   */
  function pickPageFile(commit, pageHref) {
    var files = (commit && commit.files) || [];
    if (!files.length) return null;
    var base = String(pageHref || '').split('?')[0].split('#')[0]
      .replace(/^https?:\/\/[^/]+/i, '').replace(/^\//, '').replace(/\/$/, '');
    if (base) {
      // Try exact basename match, with and without an .html extension.
      var wantA = base.toLowerCase();
      var wantB = base.replace(/\.html$/i, '').toLowerCase();
      for (var i = 0; i < files.length; i++) {
        var fn = String((files[i] && files[i].filename) || '').split('/').pop();
        var fnLc = fn.toLowerCase();
        var fnNoExt = fnLc.replace(/\.html$/i, '');
        if (fnLc === wantA || fnNoExt === wantB) return files[i];
      }
    }
    // Else the first HTML file.
    for (var j = 0; j < files.length; j++) {
      if (/\.html?$/i.test((files[j] && files[j].filename) || '')) return files[j];
    }
    return files[0];
  }

  var STATUS_LABEL = {
    added: 'added', modified: 'modified', removed: 'removed',
    renamed: 'renamed', changed: 'modified', copied: 'copied'
  };

  // Render one unified-diff patch into colored, escaped HTML lines. Truncates
  // beyond MAX_PATCH_LINES and returns { html, truncated }.
  function renderPatch(patch, fileHref) {
    if (!patch) {
      return { html: '<div class="dl ctx">(no textual diff — binary or rename only)</div>', truncated: false };
    }
    var lines = String(patch).split('\n');
    var truncated = false;
    if (lines.length > MAX_PATCH_LINES) {
      lines = lines.slice(0, MAX_PATCH_LINES);
      truncated = true;
    }
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var cls = 'ctx';
      var c0 = ln.charAt(0);
      if (ln.indexOf('@@') === 0) cls = 'hunk';
      else if (c0 === '+') cls = 'add';
      else if (c0 === '-') cls = 'del';
      out.push('<div class="dl ' + cls + '">' + (esc(ln) || '&nbsp;') + '</div>');
    }
    if (truncated) {
      var link = fileHref
        ? '<a href="' + esc(fileHref) + '" target="_blank" rel="noopener">… view full file on GitHub ↗</a>'
        : '… (patch truncated)';
      out.push('<div class="dl trunc">' + link + '</div>');
    }
    return { html: out.join(''), truncated: truncated };
  }

  /**
   * Build the full iframe srcdoc HTML for a commit diff.
   *
   * @param {object} commit  GitHub commit JSON.
   * @param {object} [opts]
   * @param {string} [opts.sha]        Commit sha (for the GitHub commit link).
   * @param {string} [opts.pageHref]   Live-page path; renders a "view live page" link when present.
   * @param {string} [opts.description] Human description, shown above the diff.
   * @returns {string} full HTML document string
   */
  function renderDiffHtml(commit, opts) {
    opts = opts || {};
    var sha = opts.sha || '';
    var files = (commit && commit.files) || [];
    var stats = (commit && commit.stats) || {};
    var subject = firstLine(commit && commit.commit && commit.commit.message);
    var add = stats.additions || 0, del = stats.deletions || 0;
    var nFiles = files.length;
    var commitHref = sha ? (COMMIT_BASE + sha) : null;

    var head = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>'
      + '*{box-sizing:border-box}'
      + 'body{margin:0;padding:18px 16px 32px;background:#0d1117;color:#c9d1d9;'
      + 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;line-height:1.5;}'
      + '.hdr{font-size:1rem;font-weight:700;color:#f0f6fc;margin:0 0 4px;line-height:1.35;}'
      + '.sub{font-size:0.8rem;color:#8b949e;margin:0 0 14px;}'
      + '.sub .add{color:#3fb950;font-weight:600;}.sub .del{color:#f85149;font-weight:600;}'
      + '.desc{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:10px 13px;'
      + 'font-size:0.85rem;color:#c9d1d9;margin:0 0 16px;white-space:pre-wrap;}'
      + '.links{font-size:0.8rem;margin:0 0 18px;}'
      + '.links a{color:#58a6ff;font-weight:600;text-decoration:none;margin-right:16px;}'
      + '.links a:hover{text-decoration:underline;}'
      + '.file{border:1px solid #30363d;border-radius:8px;margin:0 0 12px;overflow:hidden;}'
      + 'summary{cursor:pointer;list-style:none;padding:9px 12px;background:#161b22;'
      + 'display:flex;align-items:center;gap:10px;font-size:0.82rem;font-weight:600;color:#e6edf3;}'
      + 'summary::-webkit-details-marker{display:none}'
      + 'summary .fn{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:600;'
      + 'word-break:break-all;flex:1;min-width:0;}'
      + '.badge{font-size:0.66rem;text-transform:uppercase;letter-spacing:0.04em;font-weight:700;'
      + 'padding:2px 7px;border-radius:999px;white-space:nowrap;}'
      + '.b-added{background:#11321d;color:#3fb950;border:1px solid #238636;}'
      + '.b-modified{background:#27211a;color:#d29922;border:1px solid #9e6a03;}'
      + '.b-removed{background:#311b1b;color:#f85149;border:1px solid #b62324;}'
      + '.b-renamed{background:#1c2630;color:#58a6ff;border:1px solid #1f6feb;}'
      + '.b-copied{background:#1c2630;color:#58a6ff;border:1px solid #1f6feb;}'
      + '.fstat{font-size:0.72rem;color:#8b949e;font-weight:500;white-space:nowrap;}'
      + '.fstat .a{color:#3fb950;}.fstat .d{color:#f85149;}'
      + '.diff{overflow-x:auto;background:#0d1117;}'
      + '.dl{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:0.76rem;'
      + 'line-height:1.45;white-space:pre;padding:0 12px;}'
      + '.dl.add{background:#0f2417;color:#56d364;}'
      + '.dl.del{background:#2d1417;color:#f85149;}'
      + '.dl.hunk{background:#161b22;color:#a5a5ff;font-weight:700;}'
      + '.dl.ctx{color:#8b949e;}'
      + '.dl.trunc{color:#8b949e;padding:6px 12px;}'
      + '.dl.trunc a{color:#58a6ff;}'
      + '.empty{color:#8b949e;font-size:0.85rem;}'
      + '</style></head><body>';

    var html = head;
    html += '<div class="hdr">' + (esc(subject) || 'Commit ' + esc(sha.slice(0, 8))) + '</div>';
    html += '<div class="sub">' + nFiles + ' file' + (nFiles === 1 ? '' : 's')
      + ' · <span class="add">+' + add + '</span> / <span class="del">−' + del + '</span></div>';

    if (opts.description) {
      html += '<div class="desc">' + esc(opts.description) + '</div>';
    }

    var links = [];
    if (commitHref) links.push('<a href="' + esc(commitHref) + '" target="_blank" rel="noopener">View commit on GitHub ↗</a>');
    if (opts.pageHref) links.push('<a href="' + esc(opts.pageHref) + '" target="_blank" rel="noopener">View the live page ↗</a>');
    if (links.length) html += '<div class="links">' + links.join('') + '</div>';

    if (!nFiles) {
      html += '<div class="empty">This commit reported no file changes.</div>';
    }

    for (var i = 0; i < files.length; i++) {
      var f = files[i] || {};
      var status = STATUS_LABEL[f.status] || 'modified';
      var fileHref = commitHref || null;
      var open = i === 0 ? ' open' : '';
      var fa = f.additions || 0, fd = f.deletions || 0;
      var rendered = renderPatch(f.patch, fileHref);
      html += '<details class="file"' + open + '>'
        + '<summary>'
        + '<span class="badge b-' + status + '">' + esc(status) + '</span>'
        + '<span class="fn">' + esc(f.filename || '(unknown)') + '</span>'
        + '<span class="fstat"><span class="a">+' + fa + '</span> <span class="d">−' + fd + '</span></span>'
        + '</summary>'
        + '<div class="diff">' + rendered.html + '</div>'
        + '</details>';
    }

    html += '</body></html>';
    return html;
  }

  global.ChangelogDiff = {
    buildReviewSummary: buildReviewSummary,
    renderDiffHtml: renderDiffHtml,
    extractAddedSnippets: extractAddedSnippets,
    pickPageFile: pickPageFile,
    stripHtml: stripHtml,
    // exposed for tests
    _firstLine: firstLine,
    _esc: esc,
    _tidy: tidy,
    _fileNames: fileNames,
    MAX_PATCH_LINES: MAX_PATCH_LINES,
    COMMIT_BASE: COMMIT_BASE
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = global.ChangelogDiff;
  }
})(typeof window !== 'undefined' ? window : this);
