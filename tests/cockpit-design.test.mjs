import test from 'node:test';
import assert from 'node:assert/strict';
import { designData, emptyDesign, readDesign } from '../src/cockpit-design.ts';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
} from '../src/cad/history.ts';

const designWith = (count) => {
  let history = [];
  for (let i = 0; i < count; i++) history = addAnchoredProfile(history).history;
  return { history };
};
const stored = (design) => JSON.parse(JSON.stringify(designData(design)));

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
    () => readDesign({ units: 'mm', history: [{ kind: 'add-sliding-seat' }] }),
    /Unknown operation/,
  );
});

test('a history of anchored profiles reads back with the same values', () => {
  const design = { history: editProfile(designWith(2).history, 'part-2', { name: 'Seat rail' }) };
  assert.deepEqual(readDesign(stored(design)), design);
});

test('an anchored profile with values it cannot have is rejected', () => {
  const data = stored(designWith(1));
  const withValues = (changes) => ({ ...data, history: [{ ...data.history[0], ...changes }] });
  assert.throws(() => readDesign(withValues({ lengthMm: 0 })), /length/);
  assert.throws(() => readDesign(withValues({ lengthMm: '500' })), /length/);
  assert.throws(() => readDesign(withValues({ startMm: { x: 0, y: 20 } })), /position/);
  assert.throws(() => readDesign(withValues({ sectionId: '45x45' })), /section/);
  assert.throws(() => readDesign(withValues({ systemId: 'other' })), /system/);
  assert.throws(() => readDesign(withValues({ heightAxis: 'z' })), /height/);
  assert.throws(() => readDesign(withValues({ name: 7 })), /name/);
  assert.throws(() => readDesign(withValues({ partId: '' })), /identifier/);
});

test('a stored name is cleaned as a typed one is', () => {
  const data = stored(designWith(1));
  data.history[0].name = ' <i>Rail</i> ';
  assert.equal(readDesign(data).history[0].name, 'iRail/i');
});

test('a history that repeats an identifier is rejected', () => {
  const data = stored(designWith(2));
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], { ...data.history[1], id: 'op-1' }] }),
    /op-1/,
  );
  assert.throws(
    () =>
      readDesign({ ...data, history: [data.history[0], { ...data.history[1], partId: 'part-1' }] }),
    /part-1/,
  );
});

const withGrowth = () => {
  const { history } = designWith(1);
  return { history: addOperation(history, draftGrowth(history, 'part-1')) };
};

test('a profile grown out of another reads back with its place on the face', () => {
  const design = withGrowth();
  assert.deepEqual(readDesign(stored(design)), design);
});

test('a growth must come after the part it grows from and stay on its face', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
  assert.throws(() => readDesign({ ...data, history: [growth, rail] }), /part-1/);
  assert.throws(
    () => readDesign({ ...data, history: [rail, { ...growth, alongMm: 600 }] }),
    /hang off/,
  );
  assert.throws(() => readDesign({ ...data, history: [rail, { ...growth, face: 'up' }] }), /face/);
  assert.throws(() => readDesign({ ...data, history: [rail, { ...growth, way: 'in' }] }), /way/);
  assert.throws(
    () => readDesign({ ...data, history: [rail, { ...growth, startMm: { x: 0, y: 0, z: 0 } }] }),
    /startMm/,
  );
});

test('a profile lying on a face reads back, and one lying towards its face is rejected', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
  const lying = { ...data, history: [rail, { ...growth, way: '+x' }] };
  assert.equal(readDesign(lying).history[1].way, '+x');
  assert.throws(() => readDesign({ ...data, history: [rail, { ...growth, way: '-y' }] }), /way/);
});

test('a span reads back with the part it reaches, which must be in the design', () => {
  let { history } = designWith(2);
  history = editProfile(history, 'part-2', { startMm: { x: 500, y: 20, z: 0 } });
  history = addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { face: '+x', alongMm: 250 }),
  );
  history = editProfile(history, 'part-3', { reachesId: 'part-2' });
  const data = stored({ history });
  assert.deepEqual(readDesign(data), { history });
  const lost = { ...data.history[2], reachesId: 'part-8' };
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], data.history[1], lost] }),
    /part-8/,
  );
});
