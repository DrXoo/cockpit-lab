import test from 'node:test';
import assert from 'node:assert/strict';
import {
  designPanelHTML,
  partChange,
  partField,
  partInspectorHTML,
} from '../src/cockpit-editor-view.ts';
import { addAnchoredProfile, editProfile } from '../src/cad/history.ts';

const historyWith = (count) => {
  let history = [];
  for (let i = 0; i < count; i++) history = addAnchoredProfile(history).history;
  return history;
};
const panel = (changes) =>
  designPanelHTML({
    history: [],
    selectedPartId: null,
    canUndo: false,
    canRedo: false,
    ...changes,
  });

test('an empty design explains how it starts and offers the first profile', () => {
  const html = panel();
  assert.match(html, /id="emptyDesign"/);
  assert.match(html, /id="addProfile"/);
  assert.doesNotMatch(html, /data-part="/);
});

test('the history lists its operations in order, with the selected one pressed', () => {
  const history = editProfile(historyWith(2), 'part-2', { name: 'Rail <left>' });
  const html = panel({ history, selectedPartId: 'part-2' });
  assert.doesNotMatch(html, /id="emptyDesign"/);
  const steps = [...html.matchAll(/data-part="([^"]+)" aria-pressed="(true|false)"/g)];
  assert.deepEqual(
    steps.map(([, part, pressed]) => [part, pressed]),
    [
      ['part-1', 'false'],
      ['part-2', 'true'],
    ],
  );
  assert.match(html, /Rail left/);
  assert.match(html, /id="addProfile"/);
});

test('undo and redo are offered only when there is something to undo or redo', () => {
  assert.match(panel(), /id="undoEdit"[^>]*disabled/);
  assert.match(panel(), /id="redoEdit"[^>]*disabled/);
  assert.doesNotMatch(panel({ canUndo: true }), /id="undoEdit"[^>]*disabled/);
  assert.doesNotMatch(panel({ canRedo: true }), /id="redoEdit"[^>]*disabled/);
});

test('without a selected part the inspector says how to select one', () => {
  assert.match(partInspectorHTML(undefined), /id="noPartSelected"/);
  assert.doesNotMatch(partInspectorHTML(undefined), /data-part-field/);
});

test('the inspector edits the values of the operation that made the part', () => {
  const [operation] = editProfile(historyWith(1), 'part-1', {
    name: 'Seat "rail"',
    sectionId: '40x80',
    lengthMm: 1200,
    startMm: { x: -280, y: 40, z: 12.5 },
  });
  const html = partInspectorHTML(operation);
  const value = (field) =>
    new RegExp(`data-part-field="${field}"[^>]*value="([^"]*)"`).exec(html)?.[1];
  assert.equal(value('name'), 'Seat &quot;rail&quot;');
  assert.equal(value('lengthMm'), '1200');
  assert.equal(value('startX'), '-280');
  assert.equal(value('startY'), '40');
  assert.equal(value('startZ'), '12.5');
  assert.match(html, /<option value="40x80" selected>40 × 80<\/option>/);
  assert.match(html, /data-part-field="axis"[\s\S]*<option value="z" selected>/);
});

test('the long side of the section can be turned only on a section that has one', () => {
  const [square] = historyWith(1);
  assert.doesNotMatch(partInspectorHTML(square), /data-part-field="heightAxis"/);
  const [wide] = editProfile([square], 'part-1', { sectionId: '40x80' });
  const html = partInspectorHTML(wide);
  const choices = /data-part-field="heightAxis"[^>]*>([\s\S]*?)<\/select>/.exec(html)[1];
  assert.deepEqual(
    [...choices.matchAll(/value="(\w)"/g)].map(([, axis]) => axis),
    ['x', 'y'],
  );
  assert.match(choices, /value="y" selected/);
});

test('a field of the inspector changes one value of the operation', () => {
  const [operation] = historyWith(1);
  assert.deepEqual(partChange(operation, 'name', 'Rail'), { name: 'Rail' });
  assert.deepEqual(partChange(operation, 'sectionId', '40x80'), { sectionId: '40x80' });
  assert.deepEqual(partChange(operation, 'axis', 'y'), { axis: 'y' });
  assert.deepEqual(partChange(operation, 'heightAxis', 'x'), { heightAxis: 'x' });
  assert.deepEqual(partChange(operation, 'lengthMm', '650'), { lengthMm: 650 });
  assert.deepEqual(partChange(operation, 'startZ', '-120.5'), {
    startMm: { x: 0, y: 20, z: -120.5 },
  });
});

test('a number field left empty or not a number gives no number to apply', () => {
  const [operation] = historyWith(1);
  assert.ok(Number.isNaN(partChange(operation, 'lengthMm', '').lengthMm));
  assert.ok(Number.isNaN(partChange(operation, 'startX', 'abc').startMm.x));
});

test('the markup names only fields the inspector has', () => {
  assert.equal(partField('lengthMm'), 'lengthMm');
  assert.throws(() => partField('tiltDeg'), /tiltDeg/);
  assert.throws(() => partField(undefined), /undefined/);
});
