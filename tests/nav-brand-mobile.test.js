'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const STYLE_CSS = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');

describe('Mobile nav brand', () => {
  test('mobile breakpoint replaces the tall text brand with a fixed home icon target', () => {
    assert.match(STYLE_CSS, /@media \(max-width: 700px\)/);
    assert.match(STYLE_CSS, /\.nav-brand\s*\{[\s\S]*width:\s*44px/);
    assert.match(STYLE_CSS, /\.nav-brand\s*\{[\s\S]*height:\s*44px/);
    assert.match(STYLE_CSS, /\.nav-brand \.brand-main,[\s\S]*clip:\s*rect\(0 0 0 0\)/);
    assert.match(STYLE_CSS, /\.nav-brand::before\s*\{[\s\S]*clip-path:\s*polygon/);
    assert.match(STYLE_CSS, /\.nav-links\s*\{[\s\S]*top:\s*64px/);
    assert.match(STYLE_CSS, /\.hero h1\s*\{[\s\S]*font-size:\s*2rem/);
    assert.match(STYLE_CSS, /\.hero h1\s*\{[\s\S]*overflow-wrap:\s*normal/);
  });
});
