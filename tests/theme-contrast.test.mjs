// Both themes keep text readable: WCAG AA contrast for text, 3:1 for icons and fills.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');

/** The `--token: #hex` pairs of the block that starts with `opening`. */
function tokensOf(opening) {
  const start = css.indexOf(opening);
  assert.notEqual(start, -1, `theme.css has no ${opening} block`);
  const body = css.slice(start + opening.length, css.indexOf('}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[a-z-]+):\s*(#[0-9a-f]{6,8});/g)].map((m) => [m[1], m[2]]),
  );
}

const light = tokensOf(':root {');
const dark = tokensOf(":root[data-theme='dark'] {");
const THEMES = { light, dark };

function luminance(hex) {
  const channel = (i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

const PANELS = ['--surface', '--surface-page', '--surface-subtle', '--surface-sunken'];
const TEXT = [
  ...['--text', '--text-secondary', '--text-muted'].flatMap((text) =>
    PANELS.map((panel) => [text, panel]),
  ),
  ['--text', '--surface-strong'],
  ['--text-inverse', '--surface-inverse'],
  ['--text-inverse', '--surface-inverse-hover'],
  ['--accent-text', '--surface'],
  ['--accent-text', '--accent-surface'],
  ['--accent-text', '--accent-surface-strong'],
  ['--ok', '--surface'],
  ['--ok', '--ok-surface'],
  ['--warning', '--surface'],
  ['--warning', '--warning-surface'],
  ['--error', '--surface'],
  ['--error', '--error-surface'],
  ['--opening', '--surface-sunken'],
  ['--text-muted', '--scene-background'],
];
const GRAPHICS = [
  ['--accent', '--surface'],
  ['--accent-fill', '--surface-strong'],
  ['--ok-fill', '--surface-strong'],
  ['--text-faint', '--surface'],
  ['--on-accent', '--accent-fill'],
];

test('the dark theme redefines every color token', () => {
  assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
});

for (const [name, tokens] of Object.entries(THEMES)) {
  for (const [minimum, pairs] of [
    [4.5, TEXT],
    [3, GRAPHICS],
  ])
    test(`${name} theme: ${minimum}:1 contrast for ${minimum === 3 ? 'graphics' : 'text'}`, () => {
      for (const [front, back] of pairs) {
        const ratio = contrast(tokens[front], tokens[back]);
        assert.ok(
          ratio >= minimum,
          `${front} on ${back}: ${ratio.toFixed(2)}:1 (${tokens[front]} on ${tokens[back]})`,
        );
      }
    });
}
