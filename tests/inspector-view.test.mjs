import test from 'node:test';
import assert from 'node:assert/strict';
import { validationBanner, metricsView } from '../src/inspector-view.ts';
import { defaults, evaluate } from '../src/model.ts';

const banner = (state, counts = {}) => validationBanner(state, { ...evaluate(state), ...counts });

test('the banner counts pending errors, with a symbol as well as a colour', () => {
  const one = banner(defaults, { errors: 1, warnings: 3 });
  assert.equal(one.className, 'validation-banner error');
  assert.match(one.html, /<span class="status-icon">×<\/span>/);
  assert.match(one.html, /1 issue to fix</);
  assert.match(banner(defaults, { errors: 2, warnings: 0 }).html, /2 issues to fix</);
});

test('without errors the banner counts the warnings, or says nothing interferes', () => {
  const warned = banner(defaults, { errors: 0, warnings: 2 });
  assert.equal(warned.className, 'validation-banner warning');
  assert.match(warned.html, /status-icon">!<.*2 details to review/);
  const fine = banner(defaults, { errors: 0, warnings: 0 });
  assert.equal(fine.className, 'validation-banner ');
  assert.match(fine.html, /status-icon">✓<.*No interference found/);
});

test('an empty project asks to define the space first', () => {
  const empty = {
    ...defaults,
    roomEnabled: false,
    deskEnabled: false,
  };
  const result = banner(empty);
  assert.equal(result.className, 'validation-banner');
  assert.match(result.html, /Set up your space/);
});

test('the metrics show the room size and the footprint of the whole setup', () => {
  const state = { ...defaults, roomW: 320, roomD: 410 };
  const evaluation = evaluate(state);
  const metrics = metricsView(state, evaluation);
  assert.equal(metrics.footprintHTML, '320 × 410 cm');
  assert.equal(
    metrics.spaceHTML,
    `${Math.ceil(evaluation.spaceW)} <small>×</small> ${Math.ceil(evaluation.spaceD)} <small>cm</small>`,
  );
});
