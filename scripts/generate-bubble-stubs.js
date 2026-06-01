#!/usr/bin/env node
// Generates content/systems-map/{slug}.md stubs from _structure.json
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '../content/systems-map/_structure.json');
const OUT  = path.join(__dirname, '../content/systems-map');

const bubbles = JSON.parse(fs.readFileSync(DATA, 'utf8'));

let created = 0, skipped = 0;

for (const b of bubbles) {
  const file = path.join(OUT, `${b.slug}.md`);
  if (fs.existsSync(file)) { skipped++; continue; }
  const frontmatter = [
    '---',
    `slug: "${b.slug}"`,
    `label: "${b.label}"`,
    `category: "${b.category}"`,
    `related_slugs:`,
    ...(b.related_slugs || []).map(s => `  - "${s}"`),
    '---',
    '',
    b.description_md,
    ''
  ].join('\n');
  fs.writeFileSync(file, frontmatter, 'utf8');
  created++;
}

console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
