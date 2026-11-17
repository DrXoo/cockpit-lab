import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  draftGrowth,
  editProfile,
  removePart,
  replayDesign,
} from '../src/cad/history.ts';
import { draftPlate, editPlate, editPlateDraft, plateAt } from '../src/cad/plates.ts';
import { cockpitInterferences } from '../src/cad/interference.ts';

/** A 40 × 40 rail along Z from the origin, 1000 mm long, lying on the floor. */
const railHistory = () => {
  const { history, partId } = addAnchoredProfile([]);
  return editProfile(history, partId, { name: 'Rail', lengthMm: 1000 });
};
/** The rail with a plate on it, part-2, changed as given before it is added. */
const withPlate = (changes = {}, history = railHistory()) =>
  addOperation(history, editPlateDraft(history, draftPlate(history, 'part-1'), changes));
const boxOf = (history, partId) => replayDesign(history).resolved.get(partId).box;

test('a new plate rests on top of a profile, centered on its length, its depth along it', () => {
  const history = railHistory();
  assert.deepEqual(draftPlate(history, 'part-1'), {
    kind: 'add-plate',
    id: 'op-2',
    partId: 'part-2',
    name: 'Plate 2',
    sheetId: 'aluminium-8',
    widthMm: 300,
    depthMm: 300,
    depthAxis: 'z',
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'start',
    alongMm: 500,
    acrossMm: 0,
  });
  assert.deepEqual(boxOf(withPlate(), 'part-2'), {
    min: { x: -150, y: 40, z: 350 },
    max: { x: 150, y: 48, z: 650 },
  });
});

test('on an upright, a new plate goes on its front', () => {
  const upright = editProfile(railHistory(), 'part-1', { axis: 'y' });
  const draft = draftPlate(upright, 'part-1');
  assert.equal(draft.face, '+z');
  assert.equal(draft.depthAxis, 'y');
  assert.deepEqual(boxOf(withPlate({}, upright), 'part-2'), {
    min: { x: -150, y: 370, z: 20 },
    max: { x: 150, y: 670, z: 28 },
  });
});

test('its size, its sheet and the way its depth runs are edited as values of its step', () => {
  const history = editPlate(withPlate(), 'part-2', {
    name: 'Pedal plate',
    widthMm: 200,
    depthMm: 400,
    sheetId: 'aluminium-4',
    depthAxis: 'x',
  });
  assert.equal(history[1].name, 'Pedal plate');
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: -200, y: 40, z: 400 },
    max: { x: 200, y: 44, z: 600 },
  });
  assert.equal(editPlate(history, 'part-2', { name: '  ' })[1].name, 'Pedal plate');
});

test('a plate may reach beyond its face, but it must rest on part of it', () => {
  assert.equal(boxOf(withPlate({ acrossMm: 160 }), 'part-2').min.x, 10);
  assert.equal(boxOf(withPlate({ alongMm: 1100 }), 'part-2').min.z, 950);
  assert.throws(() => withPlate({ acrossMm: 200 }), /Plate 2 would not rest on Rail/);
  assert.throws(() => withPlate({ alongMm: 1200 }), /Plate 2 would not rest on Rail/);
  const history = withPlate();
  assert.throws(() => editPlate(history, 'part-2', { acrossMm: -200 }), /would not rest on/);
});

test('a plate takes only sizes and sheets the catalog has, its depth along its face', () => {
  assert.throws(() => withPlate({ widthMm: 40 }), /between 50 and 1500 mm/);
  assert.throws(() => withPlate({ depthMm: 1600 }), /between 50 and 1500 mm/);
  assert.throws(() => withPlate({ sheetId: 'steel-8' }), /not in the catalog/);
  assert.throws(() => withPlate({ depthAxis: 'y' }), /depth/);
});

test('a click on a face moves the plate there, from the nearer end and centered across it', () => {
  const history = railHistory();
  const draft = editPlateDraft(history, draftPlate(history, 'part-1'), { acrossMm: 50 });
  const moved = plateAt(history, draft, '+x', { x: 20, y: 30, z: 800 });
  assert.deepEqual(
    [moved.face, moved.fromEnd, moved.alongMm, moved.acrossMm, moved.depthAxis],
    ['+x', 'end', 200, 0, 'z'],
  );
  const across = editPlateDraft(history, draft, { depthAxis: 'x' });
  assert.equal(plateAt(history, across, '+x', { x: 20, y: 30, z: 800 }).depthAxis, 'y');
});

test('a plate fails when its profile turns so that it would rest on its end', () => {
  const turned = editProfile(withPlate(), 'part-1', { axis: 'y' });
  assert.match(
    replayDesign(turned).failures.get('op-2'),
    /rests on a side of Rail, not on its end/,
  );
});

test('a plate whose profile is removed stays where it is', () => {
  const history = withPlate({ acrossMm: 30 });
  const removed = removePart(history, 'part-1');
  assert.deepEqual(boxOf(removed, 'part-2'), boxOf(history, 'part-2'));
});

test('nothing grows out of a plate, no foot goes under one and no span reaches one', () => {
  const history = withPlate();
  assert.throws(() => draftGrowth(history, 'part-2'), /only grows out of a profile/);
  assert.throws(() => addFoot(history, 'part-2'), /goes under a profile/);
  const growth = draftGrowth(history, 'part-1');
  assert.throws(
    () => addOperation(history, { ...growth, parentId: 'part-2' }),
    /It grows out of Plate 2, and a profile only grows out of another profile/,
  );
  assert.throws(
    () => addOperation(history, { ...growth, reachesId: 'part-2' }),
    /It reaches Plate 2, and a span only reaches a profile/,
  );
});

test('a plate makes a joint with its profile, resting on it without reaching into it', () => {
  const design = replayDesign(withPlate());
  assert.deepEqual(
    design.joints.map((joint) => [joint.id, joint.toFace]),
    [['part-2@part-1', '+y']],
  );
  assert.deepEqual(cockpitInterferences(design.resolved), []);
});
