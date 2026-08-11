#!/usr/bin/env node
/**
 * Deploy drift check — verifies that what's LIVE matches what's in the repos.
 *
 * Why this exists: the soma-guide engine USED to deploy MANUALLY to
 * soma-guide.netlify.app (not git-triggered), while this site deploys via
 * git CD. The classic failure mode is "fixed in source, never redeployed" —
 * the 2026-06-10 keyword regression stayed live for exactly this reason, and
 * on 2026-08-11 that CDN was returning 404 for its ENTIRE site while
 * production still shipped the reference. Ask Bill was dead for every member
 * and nothing noticed.
 *
 * The engine is now VENDORED same-origin at /vendor/soma-guide/, so it ships
 * and rolls back with this repo. These checks now guard the vendored copy.
 *
 * Checks:
 *   1. live /vendor/soma-guide/soma-guide.js  === vendor/soma-guide/soma-guide.js
 *   2. live /vendor/soma-guide/soma-guide.css === vendor/soma-guide/soma-guide.css
 *   3. live legends-guide-config.js === js/legends-guide-config.js
 *   4. live legends-knowledge.js    === js/legends-knowledge.js
 *   5. live legends-ask-bill-resilience.js === js/legends-ask-bill-resilience.js
 *   6. no page still references the dead soma-guide CDN
 *   7. /.netlify/functions/submit-feedback responds (405 to GET = healthy)
 *   8. inference endpoint is reachable (may degrade; must be reported)
 *
 * Run: npm run verify:deploy        (network required; ~5s)
 * Exit code 1 on any drift — wire into post-deploy checks.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = process.env.DEPLOY_URL || 'https://legends-membership.netlify.app';
const VENDOR = path.join(ROOT, 'vendor', 'soma-guide');
const ENGINE_LOCAL = process.env.SOMA_GUIDE_SRC
  ? path.dirname(process.env.SOMA_GUIDE_SRC)
  : path.join(ROOT, '..', 'soma-platform', 'packages', 'soma-guide');

let failures = 0;
const ok   = (msg) => console.log(`  ✓ ${msg}`);
const bad  = (msg) => { failures++; console.log(`  ✗ ${msg}`); };
const warn = (msg) => console.log(`  ⚠ ${msg}`);

async function fetchText(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.text();
}

function versionOf(src) {
  const m = src.match(/SOMA_GUIDE_VERSION\s*=\s*'([^']+)'/);
  return m ? m[1] : '?';
}

async function compare(label, liveUrl, localPath) {
  let live;
  try {
    live = await fetchText(liveUrl);
  } catch (e) {
    bad(`${label}: cannot fetch ${liveUrl} (${e.message})`);
    return;
  }
  if (!fs.existsSync(localPath)) {
    warn(`${label}: local file missing (${localPath}) — skipping comparison`);
    return;
  }
  const local = fs.readFileSync(localPath, 'utf8');
  if (live.trim() === local.trim()) {
    ok(`${label}: live matches local`);
  } else {
    const extra = label.includes('engine')
      ? ` (live v${versionOf(live)} vs local v${versionOf(local)})` : '';
    bad(`${label}: LIVE DIFFERS FROM LOCAL${extra} — redeploy needed`);
  }
}

console.log(`\nDeploy drift check — ${new Date().toISOString()}\n`);

console.log('Engine (vendored same-origin — ships with this repo):');
await compare('soma-guide.js engine', `${SITE}/vendor/soma-guide/soma-guide.js`,  path.join(VENDOR, 'soma-guide.js'));
await compare('soma-guide.css',       `${SITE}/vendor/soma-guide/soma-guide.css`, path.join(VENDOR, 'soma-guide.css'));

console.log('\nBill costume (git CD — drift means unpushed/undeployed commits):');
await compare('legends-guide-config.js', `${SITE}/js/legends-guide-config.js`, path.join(ROOT, 'js', 'legends-guide-config.js'));
await compare('legends-knowledge.js',    `${SITE}/js/legends-knowledge.js`,    path.join(ROOT, 'js', 'legends-knowledge.js'));
await compare('legends-ask-bill-resilience.js', `${SITE}/js/legends-ask-bill-resilience.js`, path.join(ROOT, 'js', 'legends-ask-bill-resilience.js'));

console.log('\nDead-CDN guard (the 2026-08-11 outage must not come back):');
try {
  const home = await fetchText(`${SITE}/`);
  if (home.includes('soma-guide.netlify.app')) {
    bad('live home page still references soma-guide.netlify.app — Ask Bill depends on a dead host');
  } else {
    ok('no reference to the dead soma-guide CDN on the live home page');
  }
} catch (e) {
  bad(`could not fetch the live home page (${e.message})`);
}

/* Vendored engine must not drift from its source of truth in soma-platform. */
try {
  const vendored = fs.readFileSync(path.join(VENDOR, 'soma-guide.js'), 'utf8');
  const srcPath  = path.join(ENGINE_LOCAL, 'soma-guide.js');
  if (fs.existsSync(srcPath)) {
    const src = fs.readFileSync(srcPath, 'utf8');
    if (src.trim() === vendored.trim()) {
      ok(`vendored engine matches soma-platform source (v${versionOf(vendored)})`);
    } else {
      warn(`vendored engine differs from soma-platform source ` +
           `(vendored v${versionOf(vendored)} vs source v${versionOf(src)}) — ` +
           `refresh per vendor/soma-guide/PROVENANCE.txt if the source is newer`);
    }
  } else {
    warn('soma-platform not checked out locally — skipping vendored-vs-source comparison');
  }
} catch (e) {
  bad(`vendored engine unreadable (${e.message})`);
}

console.log('\nEndpoints:');
try {
  const res = await fetch(`${SITE}/.netlify/functions/submit-feedback`, { method: 'GET' });
  if (res.status === 405) ok('submit-feedback function: deployed (405 to GET, as designed)');
  else if (res.status === 404) bad('submit-feedback function: NOT FOUND — feedback intake is broken');
  else warn(`submit-feedback function: unexpected status ${res.status} to GET`);
} catch (e) {
  bad(`submit-feedback function: unreachable (${e.message})`);
}

try {
  const cfgSrc = fs.readFileSync(path.join(ROOT, 'js', 'legends-guide-config.js'), 'utf8');
  const m = cfgSrc.match(/inferenceUrl:\s*'([^']+)'/);
  if (m) {
    const res = await fetch(m[1], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'ping', context: 'health check', persona: 'Bill' }),
    });
    if (res.ok) ok(`inference endpoint ${m[1]}: responding`);
    else bad(`inference endpoint ${m[1]}: status ${res.status} — Ask answers will fail`);
  } else {
    warn('inferenceUrl not found in config');
  }
} catch (e) {
  bad(`inference endpoint: unreachable (${e.message}) — Bill falls back to ElevenLabs only`);
}

console.log(failures
  ? `\n${failures} drift problem(s) found — see above.\n`
  : '\nAll live surfaces match local sources.\n');
process.exit(failures ? 1 : 0);
