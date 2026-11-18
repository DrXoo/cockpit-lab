import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  editProfile,
  removePart,
  replayDesign,
} from '../src/cad/history.ts';
import { draftPlate } from '../src/cad/plates.ts';
import {
  draftPeripheral,
  editPeripheral,
  editPeripheralDraft,
  peripheralAt,
} from '../src/cad/peripherals.ts';
import { peripheralType, peripheralTypes } from '../src/cad/catalog.ts';
import { jointsOf } from '../src/cad/joints.ts';

/** A 40 × 40 rail along Z from the origin, 1000 mm long, lying on the floor. */
const railHistory = () => {
  const { history, partId } = addAnchoredProfile([]);
  return editProfile(history, partId, { name: 'Rail', lengthMm: 1000 });
};
/** The rail with a 300 × 300 × 8 mm plate on the middle of its top, part-2. */
const plateHistory = () => {
  const history = railHistory();
  return addOperation(history, draftPlate(history, 'part-1'));
};
/** The history with a peripheral mounted on `parentId`, changed as given before it is added. */
const withPeripheral = (history, parentId, typeId = 'generic-pedals', changes = {}) =>
  addOperation(
    history,
    editPeripheralDraft(history, draftPeripheral(history, parentId, typeId), changes),
  );
const boxOf = (history, partId) => replayDesign(history).resolved.get(partId).box;

test('the catalog has a generic seat, wheel base and pedal set, with estimated values', () => {
  assert.deepEqual(
    peripheralTypes().map((type) => type.category),
    ['seat', 'wheel-base', 'pedals'],
  );
  for (const type of peripheralTypes()) assert.equal(type.source.kind, 'estimated');
  assert.equal(typeof peripheralType('generic-seat').backrestDeg, 'number');
  assert.throws(() => peripheralType('generic-shifter'), /not in the catalog/);
});

test('a new peripheral goes on top of a profile, centered and facing the front, with the values of its type', () => {
  const history = railHistory();
  const type = peripheralType('generic-pedals');
  const draft = draftPeripheral(history, 'part-1', 'generic-pedals');
  assert.deepEqual(draft, {
    kind: 'mount-peripheral',
    id: 'op-2',
    partId: 'part-2',
    name: type.name,
    typeId: type.id,
    category: 'pedals',
    envelope: type.envelope,
    mountingPattern: type.mountingPattern,
    contactPoints: type.contactPoints,
    source: type.source,
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'start',
    alongMm: 500,
    acrossMm: 0,
    facing: '+z',
  });
  // The values are copies: a design never changes with the catalog.
  assert.notEqual(draft.envelope, type.envelope);
  const { widthMm, heightMm, depthMm } = type.envelope;
  assert.deepEqual(boxOf(withPeripheral(history, 'part-1'), 'part-2'), {
    min: { x: -widthMm / 2, y: 40, z: 500 - depthMm / 2 },
    max: { x: widthMm / 2, y: 40 + heightMm, z: 500 + depthMm / 2 },
  });
});

test('a seat comes with the backrest angle of its type', () => {
  const draft = draftPeripheral(railHistory(), 'part-1', 'generic-seat');
  assert.equal(draft.backrestDeg, peripheralType('generic-seat').backrestDeg);
  assert.equal('backrestDeg' in draftPeripheral(railHistory(), 'part-1', 'generic-pedals'), false);
});

test('on a plate, a new peripheral goes at its center, on the face its thickness stands out of', () => {
  const history = plateHistory();
  const draft = draftPeripheral(history, 'part-2', 'generic-wheel-base');
  assert.deepEqual(
    [draft.face, draft.fromEnd, draft.alongMm, draft.acrossMm, draft.facing],
    ['+y', 'start', 150, 0, '+z'],
  );
  const box = boxOf(withPeripheral(history, 'part-2', 'generic-wheel-base'), 'part-3');
  assert.equal(box.min.y, 48);
  assert.equal((box.min.z + box.max.z) / 2, 500);
});

test('a click on a face moves the peripheral there, from the nearer end and centered across it', () => {
  const history = railHistory();
  const draft = editPeripheralDraft(history, draftPeripheral(history, 'part-1', 'generic-pedals'), {
    acrossMm: 10,
  });
  const moved = peripheralAt(history, draft, '+x', { x: 20, y: 30, z: 800 });
  assert.deepEqual(
    [moved.face, moved.fromEnd, moved.alongMm, moved.acrossMm, moved.facing],
    ['+x', 'end', 200, 0, '+z'],
  );
  // On a face it was facing out of, it turns to face along it.
  const onTheEnd = peripheralAt(history, draft, '+z', { x: 0, y: 20, z: 1000 });
  assert.deepEqual([onTheEnd.face, onTheEnd.alongMm, onTheEnd.facing], ['+z', 0, '+y']);
});

test('its name, its place and the way it faces are edited as values of its step', () => {
  const history = editPeripheral(withPeripheral(railHistory(), 'part-1'), 'part-2', {
    name: 'Pedals',
    facing: '-x',
    fromEnd: 'end',
    alongMm: 300,
  });
  assert.equal(history[1].name, 'Pedals');
  const { widthMm, depthMm } = peripheralType('generic-pedals').envelope;
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: -depthMm / 2, y: 40, z: 700 - widthMm / 2 },
    max: { x: depthMm / 2, y: 240, z: 700 + widthMm / 2 },
  });
  assert.throws(() => editPeripheral(history, 'part-2', { facing: '+y' }), /along/);
});

test('a peripheral is mounted on its face, not off its profile or on the edge of a plate', () => {
  const rail = railHistory();
  assert.throws(
    () => withPeripheral(rail, 'part-1', 'generic-pedals', { alongMm: 1100 }),
    /hang off Rail/,
  );
  assert.throws(
    () => withPeripheral(rail, 'part-1', 'generic-pedals', { acrossMm: 30 }),
    /off the side of Rail/,
  );
  const plate = plateHistory();
  assert.throws(
    () => withPeripheral(plate, 'part-2', 'generic-pedals', { alongMm: 400 }),
    /hang off Plate 2/,
  );
  assert.throws(
    () => withPeripheral(plate, 'part-2', 'generic-pedals', { face: '+x' }),
    /edge of Plate 2/,
  );
});

test('only a profile or a plate carries a peripheral', () => {
  const withFoot = addFoot(railHistory(), 'part-1').history;
  assert.throws(() => draftPeripheral(withFoot, 'part-2', 'generic-pedals'), /profile or a plate/);
  const draft = draftPeripheral(withFoot, 'part-1', 'generic-pedals');
  assert.throws(
    () => addOperation(withFoot, { ...draft, parentId: 'part-2' }),
    /It is mounted on Leveling foot 2, and a peripheral is mounted on a profile or a plate/,
  );
  const mounted = withPeripheral(railHistory(), 'part-1');
  assert.throws(() => draftPeripheral(mounted, 'part-2', 'generic-seat'), /profile or a plate/);
});

test('a peripheral goes with the part it is mounted on, and stays on a plate whose profile goes', () => {
  const onRail = withPeripheral(railHistory(), 'part-1');
  assert.equal(replayDesign(removePart(onRail, 'part-1')).resolved.has('part-2'), false);
  const onPlate = withPeripheral(plateHistory(), 'part-2');
  const railRemoved = removePart(onPlate, 'part-1');
  assert.deepEqual(boxOf(railRemoved, 'part-3'), boxOf(onPlate, 'part-3'));
  assert.equal(replayDesign(removePart(onPlate, 'part-2')).resolved.has('part-3'), false);
});

test('a peripheral makes no joint with the part it is mounted on', () => {
  const design = replayDesign(withPeripheral(plateHistory(), 'part-2'));
  assert.deepEqual(
    jointsOf(design.resolved).map((joint) => joint.partId),
    ['part-2'],
  );
});
