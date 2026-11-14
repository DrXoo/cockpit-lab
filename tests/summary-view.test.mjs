import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeHTML } from '../src/html.ts';
import { checkLineHTML, checkMark, checkRowHTML } from '../src/check-view.ts';
import {
  partialSummary,
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
    title: 'Your cockpit, piece by piece.',
    kicker: 'FROM DESIGN TO WORKSHOP',
  });
  assert.deepEqual(summaryHeading({ ...config, cockpitEnabled: false }), {
    title: 'Project summary',
    kicker: 'YOUR SPACE',
  });
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

test('both summaries list joints without connectors, with escaped part names', () => {
  const evaluation = {
    ...evaluate(config),
    pendingJoints: [{ jointId: 'a@b', partName: 'Post <a>', toPartName: 'Rail & b' }],
  };
  for (const html of [
    fullSummaryHTML(config, evaluation),
    partialSummary(config, evaluation, completeSetup()),
  ]) {
    assert.match(html, /Joints without connectors/);
    assert.match(html, /<td>Post &lt;a&gt;<\/td><td>Rail &amp; b<\/td>/);
  }
  assert.doesNotMatch(fullSummaryHTML(config, evaluate(config)), /Joints without connectors/);
});
