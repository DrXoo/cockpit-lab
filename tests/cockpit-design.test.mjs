import test from 'node:test';
import assert from 'node:assert/strict';
import { designData, emptyDesign, readDesign } from '../src/cockpit-design.ts';

test('a new design starts with an empty history', () => {
  assert.deepEqual(emptyDesign(), { history: [] });
});

test('a design is stored as its history, in mm, and reads back the same', () => {
  const data = designData(emptyDesign());
  assert.deepEqual(data, { units: 'mm', history: [] });
  assert.deepEqual(readDesign(JSON.parse(JSON.stringify(data))), emptyDesign());
});

test('a stored design must state mm and hold a history', () => {
  assert.throws(() => readDesign({ units: 'cm', history: [] }), /units/);
  assert.throws(() => readDesign({ history: [] }), /units/);
  assert.throws(() => readDesign({ units: 'mm' }), /history/);
  assert.throws(() => readDesign({ units: 'mm', history: {} }), /history/);
  assert.throws(() => readDesign(null), /Invalid cockpit design/);
  assert.throws(() => readDesign([]), /Invalid cockpit design/);
});

test('an operation this version does not know is rejected, not skipped', () => {
  assert.throws(
    () => readDesign({ units: 'mm', history: [{ kind: 'add-anchored-profile' }] }),
    /Unknown operation/,
  );
});
