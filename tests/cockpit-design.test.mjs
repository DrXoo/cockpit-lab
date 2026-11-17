import test from 'node:test';
import assert from 'node:assert/strict';
import { designData, emptyDesign, readDesign } from '../src/cockpit-design.ts';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  replayDesign,
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

test('a stored growth that no longer applies reads back as a failed operation', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
  const reordered = readDesign({ ...data, history: [growth, rail] });
  assert.match(replayDesign(reordered.history).failures.get('op-2'), /later step/);
  const off = readDesign({ ...data, history: [rail, { ...growth, alongMm: 600 }] });
  assert.match(replayDesign(off.history).failures.get('op-2'), /hang off/);
});

test('a stored growth holds the values of its kind, and nothing else', () => {
  const data = stored(withGrowth());
  const [rail, growth] = data.history;
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

test('a span reads back with the part it reaches, or with an open end once it is gone', () => {
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
  const read = readDesign({ ...data, history: [data.history[0], data.history[1], lost] });
  assert.equal(replayDesign(read.history).resolved.get('part-3').openEnd, true);
});

test('a removal reads back, and must name the part it removes', () => {
  const { history } = designWith(1);
  const removal = { kind: 'remove-part', id: 'op-2', removedId: 'part-1' };
  assert.deepEqual(readDesign(stored({ history: [...history, removal] })).history[1], removal);
  const data = stored({ history: [...history, removal] });
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], { ...removal, removedId: 7 }] }),
    /identifier/,
  );
  assert.throws(
    () => readDesign({ ...data, history: [data.history[0], { ...removal, extra: 1 }] }),
    /extra/,
  );
});

test('a foot reads back with its type and its place under the profile', () => {
  const { history } = designWith(1);
  const foot = {
    kind: 'add-foot',
    id: 'op-2',
    partId: 'part-2',
    name: 'Leveling foot 2',
    footTypeId: 'leveling-foot',
    parentId: 'part-1',
    fromEnd: 'start',
    alongMm: 36,
  };
  const data = stored({ history: [...history, foot] });
  assert.deepEqual(readDesign(data).history[1], foot);
  const withFoot = (changes) => ({ ...data, history: [data.history[0], { ...foot, ...changes }] });
  assert.throws(() => readDesign(withFoot({ footTypeId: 'wheel' })), /wheel/);
  assert.throws(() => readDesign(withFoot({ alongMm: '36' })), /number/);
  assert.throws(() => readDesign(withFoot({ face: '-y' })), /face/);
});

test('a plate reads back with its sheet, its size and its place on the profile', () => {
  const { history } = designWith(1);
  const plate = {
    kind: 'add-plate',
    id: 'op-2',
    partId: 'part-2',
    name: 'Wheel plate',
    sheetId: 'aluminium-8',
    widthMm: 300,
    depthMm: 250,
    depthAxis: 'z',
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'end',
    alongMm: 120,
    acrossMm: 15,
  };
  const data = stored({ history: [...history, plate] });
  assert.deepEqual(readDesign(data).history[1], plate);
  const withPlate = (changes) => ({
    ...data,
    history: [data.history[0], { ...plate, ...changes }],
  });
  assert.throws(() => readDesign(withPlate({ sheetId: 'steel-2' })), /steel-2/);
  assert.throws(() => readDesign(withPlate({ widthMm: '300' })), /number/);
  assert.throws(() => readDesign(withPlate({ depthMm: 20 })), /between 50 and 1500/);
  assert.throws(() => readDesign(withPlate({ depthAxis: 'y' })), /depth/);
  assert.throws(() => readDesign(withPlate({ lengthMm: 300 })), /lengthMm/);
});

test('a fastening reads back with its connectors, once per joint', async () => {
  const { fastenWithBrackets } = await import('../src/cad/fastening.ts');
  const base = editProfile(addAnchoredProfile([]).history, 'part-1', { lengthMm: 1000 });
  const grown = addOperation(base, editDraft(base, draftGrowth(base, 'part-1'), {}));
  const history = fastenWithBrackets(grown, 'part-2@part-1');
  const data = stored({ history });
  assert.deepEqual(readDesign(data).history, history);
  const fastening = data.history[2];
  const withFastening = (changes) => ({
    ...data,
    history: [data.history[0], data.history[1], { ...fastening, ...changes }],
  });
  assert.throws(
    () => readDesign(withFastening({ connectors: [{ typeId: 'glue', side: '+z' }] })),
    /glue/,
  );
  assert.throws(
    () => readDesign(withFastening({ connectors: [{ typeId: 'corner-bracket-40', side: 'up' }] })),
    /face/,
  );
  assert.throws(() => readDesign(withFastening({ connectors: [] })), /at least one/);
  assert.throws(() => readDesign(withFastening({ jointId: 'x' })), /jointId/);
  const twice = { ...data, history: [...data.history, { ...fastening, id: 'op-4' }] };
  assert.throws(() => readDesign(twice), /twice/);
});

test('a plate fastened with bolts reads back with the bolts in each slot', async () => {
  const { fastenWithBolts } = await import('../src/cad/fastening.ts');
  const { draftPlate } = await import('../src/cad/plates.ts');
  const base = editProfile(addAnchoredProfile([]).history, 'part-1', { lengthMm: 1000 });
  const plated = addOperation(base, draftPlate(base, 'part-1'));
  const history = fastenWithBolts(plated, 'part-2@part-1', 2);
  const data = stored({ history });
  assert.deepEqual(readDesign(data).history, history);
  const withBolts = (bolts) => ({
    ...data,
    history: [data.history[0], data.history[1], { ...data.history[2], connectors: [bolts] }],
  });
  assert.throws(() => readDesign(withBolts({ typeId: 'plate-bolt-m8', perSlot: '2' })), /number/);
  assert.throws(() => readDesign(withBolts({ typeId: 'plate-bolt-m8', perSlot: 0 })), /between/);
  assert.throws(
    () => readDesign(withBolts({ typeId: 'plate-bolt-m8', perSlot: 2, side: '+y' })),
    /side/,
  );
});
