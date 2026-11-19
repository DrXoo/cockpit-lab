import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSceneTheme, SCENE_THEME_TOKENS } from '../src/scene-theme.ts';

const tokens = {
  '--scene-background': ' #101010 ',
  '--scene-grid': '#202020',
  '--scene-grid-center': '#303030',
  '--scene-ground-light': '#404040',
  '--scene-room-floor': '#505050',
};

test('the scene theme comes from the CSS tokens, trimmed', () => {
  assert.deepEqual(
    readSceneTheme((name) => tokens[name] ?? ''),
    {
      background: '#101010',
      grid: '#202020',
      gridCenter: '#303030',
      groundLight: '#404040',
      roomFloor: '#505050',
    },
  );
});

test('a missing scene token fails loudly and names it', () => {
  const read = (name) => (name === '--scene-grid' ? '' : (tokens[name] ?? ''));
  assert.throws(() => readSceneTheme(read), /--scene-grid\b/);
});

test('the stylesheet defines every scene token', () => {
  const css = readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8');
  for (const token of Object.values(SCENE_THEME_TOKENS))
    assert.match(css, new RegExp(`${token}:\\s*#[0-9a-f]{6};`), token);
});
