import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML } from '../src/html.ts';
import { checkMark, checkRowHTML } from '../src/check-view.ts';
import {
  roomSummaryHTML,
  fullSummaryHTML,
  usesPartialSummary,
  summaryHeading,
} from '../src/project-summary.ts';
import { defaults, sanitize, evaluate } from '../src/model.ts';
import { completeSetup } from '../src/project.ts';

const config = sanitize({
  ...defaults,
  roomFeatures: [{ id: 'door', type: 'door', name: 'Puerta "A" & B', wall: 'south', offset: 20 }],
  roomFurniture: [{ id: 'bed', type: 'bed', name: 'Cama & mesita', x: 0, z: 0 }],
});

test('escapeHTML neutralizes markup characters', () => {
  assert.equal(
    escapeHTML(`<a href="x">Tom & 'Jerry'</a>`),
    '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
  );
  assert.equal(escapeHTML(42), '42');
});

test('each check level has its own symbol, not only a color', () => {
  assert.equal(checkMark('ok'), '✓');
  assert.equal(checkMark('warning'), '!');
  assert.equal(checkMark('error'), '×');
});

test('a check row shows the level, the escaped texts and the symbol', () => {
  const html = checkRowHTML({
    id: 'x',
    label: 'Ancho <total>',
    value: '5 cm',
    level: 'warning',
    detail: 'A & B',
  });
  assert.match(html, /class="check-row warning"/);
  assert.match(html, /Ancho &lt;total&gt;/);
  assert.match(html, /A &amp; B/);
  assert.match(html, /<span class="check-mark">!<\/span>/);
});

test('the room summary lists openings and furniture with escaped names', () => {
  const html = roomSummaryHTML(config);
  assert.match(html, /Puerta &quot;A&quot; &amp; B/);
  assert.match(html, /Cama &amp; mesita/);
  assert.equal(roomSummaryHTML({ ...config, roomEnabled: false }), '');
});

test('the full summary includes every cut, accessory and check', () => {
  const evaluation = evaluate(config);
  const html = fullSummaryHTML(config, evaluation);
  for (const part of evaluation.parts) assert.ok(html.includes(`<td>${part.name}</td>`), part.name);
  for (const accessory of evaluation.accessories)
    assert.ok(html.includes(`<td>${accessory.name}</td>`), accessory.name);
  assert.equal(html.match(/<div class="summary-checks"><p>/g)?.length, 1);
  assert.equal(
    (html.match(/<p>[✓×!] /g) ?? []).length,
    evaluation.checks.length,
    'one line per check, each with its symbol',
  );
  assert.ok(html.includes(roomSummaryHTML(config)));
});

test('the full summary needs a finished project with the room and every element', () => {
  const finished = completeSetup();
  assert.equal(usesPartialSummary(config, finished), false);
  assert.equal(usesPartialSummary({ ...config, roomEnabled: false }, finished), true);
  assert.equal(usesPartialSummary({ ...config, pcEnabled: false }, finished), true);
  assert.equal(usesPartialSummary(config, { ...finished, step: 'desk' }), true);
});

test('the summary heading depends on whether there is a cockpit', () => {
  assert.deepEqual(summaryHeading(config), {
    title: 'Tu cockpit, pieza a pieza.',
    kicker: 'DEL DISEÑO AL TALLER',
  });
  assert.deepEqual(summaryHeading({ ...config, cockpitEnabled: false }), {
    title: 'Resumen del proyecto',
    kicker: 'TU ESPACIO',
  });
});
