#!/usr/bin/env node
/**
 * build-site.mjs — assemble the public site into `_site/` (Netlify's publish dir).
 *
 * Why this exists: the site used to publish the repo root (`publish = "."`), so
 * every tracked file was a public URL — function source, CLAUDE.md, SQL
 * migrations, package.json, a sent outreach email, a stray deploy zip. This
 * script copies ONLY what pages need at runtime, by allowlist, so a new repo
 * file is private by default and must be added here on purpose to go public.
 *
 * Allowlist (keep in sync with what pages fetch):
 *   - root *.html pages and favicon*.png
 *   - css/, js/, members/, systems-map/ (HTML/CSS/JS)
 *   - audio/   (soma-guide engine fetches /audio/tour/<hash>.mp3)
 *   - videos/  (tour videos, posters, captions on index + admin-changelog)
 *   - downloads/ (PDF/XLSX linked from membership-offerings + scholarships)
 *   - content/ minus *.md (systems-map fetches content/systems-map/_structure.json)
 *   - admin-cms/index.html (retired-CMS redirect stub to /admin.html)
 *
 * Two gates run after the copy and fail the build (exit 1):
 *   1. Deny gate: no *.md, *.sql, *.zip, *.yml, *.mjs, *.py, *.sh, *.bak*,
 *      package*.json, or anything under migrations/, netlify/, scripts/,
 *      tools/, tests/, supabase/, outreach/, partials/ may be in _site/.
 *   2. Reference gate: every local src/href/poster in a published HTML file
 *      must resolve to a file in _site/ — so the allowlist can't silently drop
 *      an asset a page needs.
 *
 * Run: `node scripts/build-nav.mjs && node scripts/build-site.mjs`
 * (wired as the Netlify build command in netlify.toml).
 *
 * Authored by Mike Wolf with Claude (Opus 5.5), 2026-10-07 — stop serving the
 * repo root (SOMA app-kit review r6, R7 / conformance gate C24).
 */

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, '_site');

const DIRS = ['css', 'js', 'members', 'systems-map', 'audio', 'videos', 'downloads', 'content'];
const ROOT_FILE = /^(.+\.html|favicon.*\.png)$/;
const EXTRA_FILES = ['admin-cms/index.html'];

// Never copied, even inside an allowlisted dir.
const SKIP = (rel) =>
  /(^|\/)\./.test(rel) ||            // dotfiles / dotdirs
  /\.bak/.test(rel) ||
  /\.md$/i.test(rel);

const DENY_FILE = /(\.md|\.sql|\.zip|\.ya?ml|\.mjs|\.py|\.sh|\.bak[^/]*|(^|\/)package(-lock)?\.json)$/i;
const DENY_DIR = /^(migrations|netlify|scripts|tools|tests|supabase|outreach|partials|node_modules)(\/|$)/;

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

const toRel = (abs, base) => relative(base, abs).split(sep).join('/');

// ── Copy ────────────────────────────────────────────────────────────────────
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

let copied = 0;
for (const name of readdirSync(ROOT)) {
  if (ROOT_FILE.test(name) && statSync(join(ROOT, name)).isFile()) {
    cpSync(join(ROOT, name), join(OUT, name));
    copied++;
  }
}
for (const d of DIRS) {
  const src = join(ROOT, d);
  if (!existsSync(src)) continue;
  for (const abs of walk(src)) {
    const rel = toRel(abs, ROOT);
    if (SKIP(rel)) continue;
    mkdirSync(dirname(join(OUT, rel)), { recursive: true });
    cpSync(abs, join(OUT, rel));
    copied++;
  }
}
for (const rel of EXTRA_FILES) {
  if (!existsSync(join(ROOT, rel))) continue;
  mkdirSync(dirname(join(OUT, rel)), { recursive: true });
  cpSync(join(ROOT, rel), join(OUT, rel));
  copied++;
}

// ── Gate 1: deny ────────────────────────────────────────────────────────────
const published = walk(OUT).map((abs) => toRel(abs, OUT));
const denied = published.filter((rel) => DENY_FILE.test(rel) || DENY_DIR.test(rel));

// ── Gate 2: every local reference in published HTML resolves ────────────────
const ATTR = /\b(?:src|href|poster)\s*=\s*["']([^"'#]+)["']/g;
const missing = [];
for (const rel of published.filter((r) => r.endsWith('.html'))) {
  const html = readFileSync(join(OUT, rel), 'utf8');
  for (const m of html.matchAll(ATTR)) {
    const ref = m[1].trim().split('?')[0];
    if (!ref || /^(https?:|mailto:|tel:|data:|javascript:|blob:|about:|\/\/)/i.test(ref)) continue;
    if (/[`${}+]/.test(ref)) continue;                     // template/concatenated URLs
    if (ref.startsWith('/.netlify/')) continue;            // functions endpoint
    const target = ref.startsWith('/')
      ? ref.slice(1)
      : normalize(join(dirname(rel), ref)).split(sep).join('/');
    if (target === '' || target === '.' || target === './') continue;
    if (target.startsWith('systems-map/')) continue;       // netlify.toml rewrite → systems-map/index.html
    const candidates = [target, join(target, 'index.html')];
    if (!candidates.some((c) => existsSync(join(OUT, c)))) {
      missing.push(`${rel} → ${m[1]}`);
    }
  }
}

console.log(`build-site: ${copied} file(s) copied into _site/`);
if (denied.length) {
  console.error(`\nDENY GATE FAILED — ${denied.length} private file(s) would be published:`);
  for (const r of denied) console.error(`  ${r}`);
}
if (missing.length) {
  console.error(`\nREFERENCE GATE FAILED — ${new Set(missing).size} local reference(s) missing from _site/:`);
  for (const r of [...new Set(missing)]) console.error(`  ${r}`);
}
if (denied.length || missing.length) process.exit(1);
console.log('build-site: deny gate + reference gate passed.');
