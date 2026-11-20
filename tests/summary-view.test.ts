import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML } from '../src/ui/html.ts';
import { checkLineHTML, checkMark, checkRowHTML } from '../src/ui/check-view.ts';
import { roomSummaryHTML, summaryHTML } from '../src/project-summary.ts';
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

test('the summary includes the room, every accessory and every check', () => {
  const evaluation = evaluate(config);
  const html = summaryHTML(config, evaluation, completeSetup());
  assert.ok(evaluation.accessories.length > 0);
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

test('a check with items lists them, escaped, in a list the user opens', () => {
  const html = checkRowHTML({
    id: 'x',
    label: 'Unsupported parts',
    value: '2',
    level: 'warning',
    detail: 'No joint connects them to a part on feet.',
    items: ['Seat post <rear>', 'Wheel crossmember'],
  });
  assert.match(html, /<details class="check-items"><summary>Show the 2<\/summary><ul>/);
  assert.match(html, /<li>Seat post &lt;rear&gt;<\/li><li>Wheel crossmember<\/li>/);
  assert.doesNotMatch(
    checkRowHTML({ id: 'y', label: 'A', value: 'B', level: 'ok', detail: '' }),
    /details/,
  );
});

test('a printed check line lists its items too', () => {
  const html = checkLineHTML({
    id: 'x',
    label: 'Unsupported parts',
    value: '1',
    level: 'warning',
    detail: 'Detail',
    items: ['Seat & post'],
  });
  assert.match(html, /<ul><li>Seat &amp; post<\/li><\/ul>/);
});
