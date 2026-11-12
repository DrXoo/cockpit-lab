import test from 'node:test';
import assert from 'node:assert/strict';
import {
  nextThemePreference,
  parseThemePreference,
  resolveTheme,
} from '../src/theme-preference.ts';

test('a stored preference is read back', () => {
  assert.equal(parseThemePreference('light'), 'light');
  assert.equal(parseThemePreference('dark'), 'dark');
  assert.equal(parseThemePreference('system'), 'system');
});

test('without a valid stored preference the theme follows the system', () => {
  assert.equal(parseThemePreference(null), 'system');
  assert.equal(parseThemePreference(''), 'system');
  assert.equal(parseThemePreference('sepia'), 'system');
});

test('the system preference decides only when the user has not chosen', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

test('the theme button cycles through system, light and dark', () => {
  assert.equal(nextThemePreference('system'), 'light');
  assert.equal(nextThemePreference('light'), 'dark');
  assert.equal(nextThemePreference('dark'), 'system');
});
