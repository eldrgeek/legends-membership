#!/usr/bin/env node
/**
 * build-nav.mjs — single source of truth for the site navigation.
 *
 * The canonical nav markup lives in `partials/nav.html`. This script inlines it
 * into every standard-nav page, wrapped in unambiguous marker comments so the
 * region is re-runnable (idempotent): re-running produces no diff.
 *
 * What it preserves:
 *  - Per-page "active" state. The active item is derived from the page's
 *    filename (see ACTIVE_STATE below) and applied to the inlined copy — the
 *    partial itself is stored un-activated. Dropdown pages get
 *    `class="nav-dropdown-toggle active"` on the matching toggle; top-level
 *    pages get `class="active"` on the matching link. This matches exactly how
 *    the pages marked active before centralization.
 *  - Role-gating. The inlined nav keeps the same ids/classes
 *    (#login-nav, #auth-nav, #nav-admin-link, #auth-name) so the per-page
 *    inline updateAuthNav / updateAuthUI logic keeps working untouched.
 *  - Bill's tour selectors (a[href="members.html"], .nav-dropdown-menu,
 *    .nav-inner, the Resources dropdown, etc.) all still resolve.
 *
 * Pages with a *genuinely different* nav (the stripped community nav on
 * community-chat.html / community-video.html) are intentionally NOT touched —
 * see SKIP_PAGES.
 *
 * Run: `node scripts/build-nav.mjs`  (also wired as the Netlify build command)
 *
 * Authored by Mike Wolf with Claude (Opus 4.8), 2026-06-26 — nav centralization.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const BEGIN = '<!-- BEGIN nav (generated from partials/nav.html — do not edit inline) -->';
const END = '<!-- END nav -->';

/**
 * The set of pages that carry the standard site nav, mapped to their active
 * target. `null` means no active item (home/admin/community-info/triage pages).
 *
 * Active kinds:
 *   { dropdown: 'members.html'  }  -> activate the Committee dropdown toggle
 *   { dropdown: 'resources.html' } -> activate the Resources dropdown toggle
 *   { link: 'recommendations.html' } -> activate a top-level link
 *   null -> no active item
 */
const ACTIVE_STATE = {
  // No active item
  'index.html': null,
  'community-info.html': null,
  'admin.html': null,
  'admin-changelog.html': null,
  'admin-recommendations.html': null,
  'bugs.html': null,
  'features.html': null,

  // Committee dropdown active
  'members.html': { dropdown: 'members.html' },
  'subcommittee-chapter-presidents.html': { dropdown: 'members.html' },
  'subcommittee-membership.html': { dropdown: 'members.html' },
  'subcommittee-scholarships.html': { dropdown: 'members.html' },
  'transition-services.html': { dropdown: 'members.html' },

  // Resources dropdown active
  'resources.html': { dropdown: 'resources.html' },
  'minutes.html': { dropdown: 'resources.html' },
  'systems-map.html': { dropdown: 'resources.html' },
  'assessment.html': { dropdown: 'resources.html' },
  'player-benefits.html': { dropdown: 'resources.html' },
  'membership-offerings.html': { dropdown: 'resources.html' },

  // Top-level link active
  'recommendations.html': { link: 'recommendations.html' },
  'leslie-johnson-ideas.html': { link: 'recommendations.html' },
  'rec-detail.html': { link: 'recommendations.html' },
  'about.html': { link: 'about.html' },
};

/**
 * Pages whose nav is intentionally different and must be left alone.
 * The community sub-site uses a stripped nav (Information / Video Meet / Chat);
 * the dynamic Community dropdown is injected at runtime by js/community-nav.js.
 */
const SKIP_PAGES = new Set(['community-chat.html', 'community-video.html']);

/** Load the canonical (un-activated) nav partial. */
function loadPartial() {
  return readFileSync(join(ROOT, 'partials', 'nav.html'), 'utf8').replace(/\s+$/, '');
}

/** Apply per-page active state to a copy of the partial markup. */
function applyActiveState(navHtml, active) {
  if (!active) return navHtml;

  if (active.dropdown) {
    // Activate the dropdown toggle whose href matches.
    const needle =
      `<a href="${active.dropdown}" class="nav-dropdown-toggle" aria-haspopup="true" aria-expanded="false">`;
    const replacement =
      `<a href="${active.dropdown}" class="nav-dropdown-toggle active" aria-haspopup="true" aria-expanded="false">`;
    if (!navHtml.includes(needle)) {
      throw new Error(`Could not find dropdown toggle for ${active.dropdown} to activate`);
    }
    return navHtml.replace(needle, replacement);
  }

  if (active.link) {
    // Activate the top-level link whose href matches (the bare top-level <li>,
    // not a dropdown menu item — those carry role="menuitem").
    const needle = `<li><a href="${active.link}">`;
    const replacement = `<li><a href="${active.link}" class="active">`;
    if (!navHtml.includes(needle)) {
      throw new Error(`Could not find top-level link for ${active.link} to activate`);
    }
    return navHtml.replace(needle, replacement);
  }

  return navHtml;
}

/** Build the marker-wrapped, page-specific nav block. */
export function buildNavFor(page) {
  if (!(page in ACTIVE_STATE)) {
    throw new Error(`No active-state entry for ${page}`);
  }
  const nav = applyActiveState(loadPartial(), ACTIVE_STATE[page]);
  return `${BEGIN}\n${nav}\n${END}`;
}

/**
 * Replace the current nav region in a page's HTML with the generated block.
 * Matches the marker region if present (idempotent re-run), otherwise the first
 * raw <nav>...</nav> block (first-time migration). Returns the new HTML, or the
 * same string if there was nothing to replace.
 */
export function injectNav(html, page) {
  const block = buildNavFor(page);

  // Already marked? Replace the marked region.
  const markerRe = new RegExp(
    `${escapeRe(BEGIN)}[\\s\\S]*?${escapeRe(END)}`,
  );
  if (markerRe.test(html)) {
    return html.replace(markerRe, block);
  }

  // First-time migration: replace the first raw <nav>...</nav> block.
  const navRe = /<nav>[\s\S]*?<\/nav>/;
  if (navRe.test(html)) {
    return html.replace(navRe, block);
  }

  return html;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Run the build across all standard-nav pages. */
export function buildAll({ check = false } = {}) {
  const results = [];
  for (const page of Object.keys(ACTIVE_STATE)) {
    if (SKIP_PAGES.has(page)) continue;
    const filePath = join(ROOT, page);
    let html;
    try {
      html = readFileSync(filePath, 'utf8');
    } catch {
      results.push({ page, status: 'missing' });
      continue;
    }
    const next = injectNav(html, page);
    if (next === html) {
      results.push({ page, status: 'unchanged' });
    } else if (check) {
      results.push({ page, status: 'drift' });
    } else {
      writeFileSync(filePath, next);
      results.push({ page, status: 'written' });
    }
  }
  return results;
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const results = buildAll({ check });
  const drift = results.filter((r) => r.status === 'drift');
  const written = results.filter((r) => r.status === 'written');
  const missing = results.filter((r) => r.status === 'missing');

  for (const r of results) {
    console.log(`  ${r.status.padEnd(9)} ${r.page}`);
  }
  if (missing.length) {
    console.warn(`\nWarning: ${missing.length} page(s) missing: ${missing.map((r) => r.page).join(', ')}`);
  }

  if (check) {
    if (drift.length) {
      console.error(`\nNav drift detected in ${drift.length} page(s). Run \`node scripts/build-nav.mjs\` to regenerate.`);
      process.exit(1);
    }
    console.log('\nNav is up to date (no drift).');
  } else {
    console.log(`\nNav build complete — ${written.length} page(s) regenerated.`);
  }
}
