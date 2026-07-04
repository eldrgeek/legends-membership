/**
 * page-gates.test.js — committee-only PAGE-level gates + admin allowlist canon.
 *
 * Mike's directive chain (2026-07-03/04, WQ-79 follow-up → WQ-80 prep):
 *  1. systems-map.html and assessment.html are labeled committee-only and were
 *     nav-hidden for visitors (WQ-79), but remained reachable by direct URL.
 *     They now carry the minutes.html head gate: document hidden until a
 *     session is confirmed; signed-out visitors redirect to
 *     /login.html?redirect=<page>. The bubble-detail page under /systems-map/
 *     is the same surface and carries the same gate.
 *  2. Every ADMIN_EMAILS-style allowlist in the repo includes the demo admin
 *     account (demo-admin@mike-wolf.com) used for the admin walkthrough video —
 *     added everywhere in one commit so no admin surface half-works.
 *
 * Authored 2026-07-04 by Dee (Claude Code) for Mike Wolf — WQ-80 prep.
 */

'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');

function read(page) {
  return fs.readFileSync(path.join(ROOT, page), 'utf8');
}

function head(html) {
  return html.slice(0, html.indexOf('</head>'));
}

// ---------------------------------------------------------------------------
// 1. Page-level gates (minutes.html pattern) on committee-only pages.
// ---------------------------------------------------------------------------

const GATED_PAGES = [
  'minutes.html', // the reference implementation
  'systems-map.html',
  'assessment.html',
  'systems-map/index.html', // bubble-detail page, same committee-only surface
];

describe('committee-only page gates (minutes.html pattern)', () => {
  for (const page of GATED_PAGES) {
    describe(page, () => {
      const h = head(read(page));

      test('hides the document until a session is confirmed', () => {
        assert.match(
          h,
          /document\.documentElement\.style\.visibility = 'hidden'/,
          `${page} must ship hidden pending auth (no committee-content flash)`
        );
      });

      test('redirects signed-out visitors to login with a return path', () => {
        assert.ok(
          h.includes("window.location.replace('/login.html?redirect='"),
          `${page} must redirect signed-out visitors to /login.html?redirect=…`
        );
      });

      test('gate registers BEFORE SomaAuth.init (INITIAL_SESSION contract)', () => {
        const handlerAt = h.indexOf('SomaAuth.onAuthStateChange');
        const initAt = h.indexOf('SomaAuth.init(');
        assert.ok(handlerAt !== -1 && initAt !== -1, 'both must exist in <head>');
        assert.ok(
          handlerAt < initAt,
          'onAuthStateChange must be registered before init() to receive INITIAL_SESSION'
        );
      });

      test('reveals the document once a user is present', () => {
        assert.match(
          h,
          /document\.documentElement\.style\.visibility = ''/,
          `${page} must un-hide for signed-in users`
        );
      });
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Admin allowlist canon: every declaration carries all three admins.
// ---------------------------------------------------------------------------

const ADMINS = ['mw@mike-wolf.com', 'gfos44@gmail.com', 'demo-admin@mike-wolf.com'];

describe('ADMIN_EMAILS allowlist canon', () => {
  // Find every allowlist declaration in tracked source (not tests, not deps).
  const out = execSync(
    "grep -rln --include='*.html' --include='*.js' -e 'ADMIN_EMAILS' -e \"var admins = \\['mw@\" . " +
      '| grep -v node_modules | grep -v tests/ || true',
    { cwd: ROOT, encoding: 'utf8' }
  );
  const files = out.split('\n').filter(Boolean).map((f) => f.replace(/^\.\//, ''));

  test('allowlist declarations found (sanity)', () => {
    assert.ok(files.length >= 30, `expected 30+ files with allowlists, got ${files.length}`);
  });

  for (const file of files) {
    test(`${file}: every allowlist includes all three admin emails`, () => {
      const src = read(file);
      const decls = src.match(/(?:ADMIN_EMAILS\w*|var admins) = \[[^\]]*\]/g) || [];
      // Files that merely reference ADMIN_EMAILS (no literal declaration) pass.
      for (const decl of decls) {
        for (const email of ADMINS) {
          assert.ok(
            decl.includes(`'${email}'`),
            `${file}: allowlist "${decl}" missing ${email}`
          );
        }
      }
    });
  }
});
