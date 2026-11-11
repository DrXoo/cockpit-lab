import test from 'node:test';
import assert from 'node:assert/strict';
import { validationBanner, metricsView } from '../src/inspector-view.ts';
import { defaults, evaluate } from '../src/model.ts';

const banner = (state, counts = {}) => validationBanner(state, { ...evaluate(state), ...counts });

test('the banner counts pending errors, with a symbol as well as a colour', () => {
  const one = banner(defaults, { errors: 1, warnings: 3 });
  assert.equal(one.className, 'validation-banner error');
  assert.match(one.html, /<span class="status-icon">×<\/span>/);
  assert.match(one.html, /1 ajuste pendiente</);
  assert.match(banner(defaults, { errors: 2, warnings: 0 }).html, /2 ajustes pendientes</);
});

test('without errors the banner counts the warnings, or says all is fine', () => {
  const warned = banner(defaults, { errors: 0, warnings: 2 });
  assert.equal(warned.className, 'validation-banner warning');
  assert.match(warned.html, /status-icon">!<.*2 detalles por revisar/);
  const fine = banner(defaults, { errors: 0, warnings: 0 });
  assert.equal(fine.className, 'validation-banner ');
  assert.match(fine.html, /status-icon">✓<.*Buen punto de partida/);
});

test('an empty project asks to define the space first', () => {
  const empty = {
    ...defaults,
    roomEnabled: false,
    deskEnabled: false,
    cockpitEnabled: false,
  };
  const result = banner(empty);
  assert.equal(result.className, 'validation-banner');
  assert.match(result.html, /Define tu espacio/);
});

test('without a cockpit and with nothing to fix, only the added elements are checked', () => {
  const result = banner({ ...defaults, cockpitEnabled: false }, { errors: 0, warnings: 0 });
  assert.match(result.html, /Sin interferencias detectadas/);
});

test('the metrics show the chassis, the whole setup and the aluminium needed', () => {
  const evaluation = evaluate(defaults);
  const metrics = metricsView(defaults, evaluation);
  assert.equal(
    metrics.footprintHTML,
    `${defaults.length} <small>×</small> ${defaults.width} <small>cm</small>`,
  );
  assert.equal(
    metrics.widthNote,
    `${Math.ceil(evaluation.rigRight - evaluation.rigLeft)} cm con accesorios`,
  );
  assert.match(metrics.profilesHTML, /^[\d,.]+ <small>m<\/small>$/);
  assert.equal(metrics.piecesText, `${evaluation.cuts} cortes · serie 40`);
});

test('without a cockpit the first metric is the room size', () => {
  const state = { ...defaults, cockpitEnabled: false, roomW: 320, roomD: 410 };
  const metrics = metricsView(state, evaluate(state));
  assert.equal(metrics.footprintHTML, '320 × 410 cm');
  assert.equal(metrics.widthNote, 'Medidas interiores');
});
