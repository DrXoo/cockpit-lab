import test from 'node:test';
import assert from 'node:assert/strict';
import { addFoot, addOperation, removePart, replayDesign } from '../src/cad/history.ts';
import {
  addMountingHole,
  differsFromItsType,
  draftPeripheral,
  editPeripheral,
  editPeripheralDraft,
  peripheralAt,
  removeMountingHole,
  swapPeripheralType,
} from '../src/cad/peripherals.ts';
import { peripheralType, peripheralTypes } from '../src/cad/catalog.ts';
import { jointsOf } from '../src/cad/joints.ts';
import { plateHistory, railHistory, withPeripheral } from './support/designs.ts';

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
  assert.deepEqual(boxOf(withPeripheral(history, 'part-1', 'generic-pedals'), 'part-2'), {
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
  const history = editPeripheral(
    withPeripheral(railHistory(), 'part-1', 'generic-pedals'),
    'part-2',
    {
      name: 'Pedals',
      facing: '-x',
      fromEnd: 'end',
      alongMm: 300,
    },
  );
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
  const mounted = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.throws(() => draftPeripheral(mounted, 'part-2', 'generic-seat'), /profile or a plate/);
});

test('a peripheral goes with the part it is mounted on, and stays on a plate whose profile goes', () => {
  const onRail = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.equal(replayDesign(removePart(onRail, 'part-1')).resolved.has('part-2'), false);
  const onPlate = withPeripheral(plateHistory(), 'part-2', 'generic-pedals');
  const railRemoved = removePart(onPlate, 'part-1');
  assert.deepEqual(boxOf(railRemoved, 'part-3'), boxOf(onPlate, 'part-3'));
  assert.equal(replayDesign(removePart(onPlate, 'part-2')).resolved.has('part-3'), false);
});

test('a peripheral makes no joint with the part it is mounted on', () => {
  const design = replayDesign(withPeripheral(plateHistory(), 'part-2', 'generic-pedals'));
  assert.deepEqual(
    jointsOf(design.resolved).map((joint) => joint.partId),
    ['part-2'],
  );
});

test('its envelope, mounting pattern, contact points and backrest are edited as values of its step', () => {
  const seat = withPeripheral(railHistory(), 'part-1', 'generic-seat');
  const holes = [
    { xMm: -150, yMm: -140, diameterMm: 8.5 },
    { xMm: 150, yMm: 140, diameterMm: 10 },
  ];
  const history = editPeripheral(seat, 'part-2', {
    envelope: { widthMm: 500, heightMm: 950, depthMm: 680 },
    mountingPattern: { holes },
    contactPoints: [{ role: 'hip', offsetMm: { x: 0, y: 120, z: -160 } }],
    backrestDeg: 30,
  });
  assert.deepEqual(history[1].envelope, { widthMm: 500, heightMm: 950, depthMm: 680 });
  assert.deepEqual(history[1].mountingPattern.holes, holes);
  assert.deepEqual(history[1].contactPoints[0].offsetMm, { x: 0, y: 120, z: -160 });
  assert.equal(history[1].backrestDeg, 30);
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: -250, y: 40, z: 160 },
    max: { x: 250, y: 990, z: 840 },
  });
  assert.deepEqual(
    peripheralType('generic-seat').envelope,
    seat[1].envelope,
    'the catalog keeps its values',
  );
});

test('resizing a peripheral never moves its mounting holes or contact points', () => {
  const seat = withPeripheral(railHistory(), 'part-1', 'generic-seat');
  const history = editPeripheral(seat, 'part-2', {
    envelope: { widthMm: 400, heightMm: 800, depthMm: 600 },
  });
  assert.deepEqual(history[1].mountingPattern, seat[1].mountingPattern);
  assert.deepEqual(history[1].contactPoints, seat[1].contactPoints);
});

test('a peripheral refuses values it cannot have, and only a seat has a backrest', () => {
  const pedals = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  const envelope = { widthMm: 5, heightMm: 200, depthMm: 320 };
  assert.throws(() => editPeripheral(pedals, 'part-2', { envelope }), /between 10 and 2000 mm/);
  const holes = [{ xMm: 0, yMm: 0, diameterMm: 0 }];
  assert.throws(() => editPeripheral(pedals, 'part-2', { mountingPattern: { holes } }), /diameter/);
  const contactPoints = [{ role: 'heel', offsetMm: { x: 0, y: Number.NaN, z: 0 } }];
  assert.throws(() => editPeripheral(pedals, 'part-2', { contactPoints }), /contact point/);
  assert.throws(() => editPeripheral(pedals, 'part-2', { backrestDeg: 20 }), /Only a seat/);
  const seat = withPeripheral(railHistory(), 'part-1', 'generic-seat');
  assert.throws(() => editPeripheral(seat, 'part-2', { backrestDeg: 100 }), /between 0 and 90°/);
});

test('a hole added to a mounting pattern goes at its origin, as wide as the last one', () => {
  const pedals = withPeripheral(railHistory(), 'part-1', 'generic-wheel-base');
  const added = addMountingHole(pedals, 'part-2');
  assert.equal(added[1].mountingPattern.holes.length, 5);
  assert.deepEqual(added[1].mountingPattern.holes.at(-1), { xMm: 0, yMm: 0, diameterMm: 6.5 });
  const emptied = [3, 2, 1, 0].reduce(
    (history, index) => removeMountingHole(history, 'part-2', index),
    pedals,
  );
  assert.deepEqual(emptied[1].mountingPattern.holes, []);
  const first = addMountingHole(emptied, 'part-2');
  assert.deepEqual(first[1].mountingPattern.holes, [{ xMm: 0, yMm: 0, diameterMm: 8.5 }]);
  assert.throws(() => removeMountingHole(emptied, 'part-2', 0), /no hole 1/);
});

test('a peripheral differs from its type once its envelope, holes, contact points or backrest are edited', () => {
  const seat = withPeripheral(railHistory(), 'part-1', 'generic-seat');
  assert.equal(differsFromItsType(seat[1]), false);
  const moved = editPeripheral(seat, 'part-2', { name: 'My seat', alongMm: 300, facing: '-x' });
  assert.equal(differsFromItsType(moved[1]), false, 'its name and place are not its type');
  assert.equal(differsFromItsType(editPeripheral(seat, 'part-2', { backrestDeg: 20 })[1]), true);
  assert.equal(differsFromItsType(addMountingHole(seat, 'part-2')[1]), true);
  const envelope = { widthMm: 541, heightMm: 900, depthMm: 700 };
  assert.equal(differsFromItsType(editPeripheral(seat, 'part-2', { envelope })[1]), true);
  // A type that has left the catalog cannot give its values back.
  assert.equal(differsFromItsType({ ...seat[1], typeId: 'retired-seat' }), true);
});

test('swapping its type keeps where it is mounted and replaces the values of its type', () => {
  const pedals = editPeripheral(
    withPeripheral(railHistory(), 'part-1', 'generic-pedals'),
    'part-2',
    {
      alongMm: 300,
      fromEnd: 'end',
      acrossMm: 5,
      facing: '-x',
      envelope: { widthMm: 420, heightMm: 210, depthMm: 330 },
    },
  );
  const history = swapPeripheralType(pedals, 'part-2', 'generic-seat');
  const seat = peripheralType('generic-seat');
  const swapped = history[1];
  assert.deepEqual(
    [
      swapped.parentId,
      swapped.face,
      swapped.fromEnd,
      swapped.alongMm,
      swapped.acrossMm,
      swapped.facing,
    ],
    ['part-1', '+y', 'end', 300, 5, '-x'],
  );
  assert.deepEqual(
    [swapped.typeId, swapped.category, swapped.name, swapped.backrestDeg],
    [seat.id, 'seat', seat.name, seat.backrestDeg],
  );
  assert.deepEqual(
    [swapped.envelope, swapped.mountingPattern, swapped.contactPoints, swapped.source],
    [seat.envelope, seat.mountingPattern, seat.contactPoints, seat.source],
  );
  assert.equal(differsFromItsType(swapped), false);
  const back = swapPeripheralType(history, 'part-2', 'generic-pedals')[1];
  assert.equal('backrestDeg' in back, false, 'only a seat has a backrest');
});

test('a peripheral swapped for another type keeps a name the user gave it', () => {
  const named = editPeripheral(
    withPeripheral(railHistory(), 'part-1', 'generic-pedals'),
    'part-2',
    {
      name: 'Clutch side',
    },
  );
  assert.equal(swapPeripheralType(named, 'part-2', 'generic-seat')[1].name, 'Clutch side');
  assert.throws(() => swapPeripheralType(named, 'part-1', 'generic-seat'), /not a peripheral/);
  assert.throws(() => swapPeripheralType(named, 'part-2', 'generic-shifter'), /not in the catalog/);
});
