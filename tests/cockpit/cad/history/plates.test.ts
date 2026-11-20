import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addFoot,
  addOperation,
  draftGrowth,
  editProfile,
  removePart,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import {
  draftPlate,
  editPlate,
  editPlateDraft,
  plateAt,
} from '../../../../src/cockpit/cad/history/plates.ts';
import { cockpitInterferences } from '../../../../src/cockpit/cad/analysis/interference.ts';
import { railHistory, withPlate } from '../../../support/designs.ts';
import { ofKind, present } from '../../../support/lookups.ts';

/** The rail with a plate on it, part-2, changed as given before it is added. */
const boxOf = (history: readonly Operation[], partId: string) =>
  present(replayDesign(history).resolved.get(partId), partId).box;

test('a new plate rests on top of a profile, centered on its length, its depth along it', () => {
  const history = railHistory();
  assert.deepEqual(draftPlate(history, 'part-1'), {
    kind: 'add-plate',
    id: 'op-2',
    partId: 'part-2',
    name: 'Plate 2',
    sheetId: 'aluminium-8',
    processId: 'laser-cutting',
    widthMm: 300,
    depthMm: 300,
    depthAxis: 'z',
    parentId: 'part-1',
    face: '+y',
    fromEnd: 'start',
    alongMm: 500,
    acrossMm: 0,
  });
  assert.deepEqual(boxOf(withPlate(railHistory(), 'part-1'), 'part-2'), {
    min: { x: -150, y: 40, z: 350 },
    max: { x: 150, y: 48, z: 650 },
  });
});

test('on an upright, a new plate goes on its front', () => {
  const upright = editProfile(railHistory(), 'part-1', { axis: 'y' });
  const draft = draftPlate(upright, 'part-1');
  assert.equal(draft.face, '+z');
  assert.equal(draft.depthAxis, 'y');
  assert.deepEqual(boxOf(withPlate(upright, 'part-1'), 'part-2'), {
    min: { x: -150, y: 370, z: 20 },
    max: { x: 150, y: 670, z: 28 },
  });
});

test('its size, its sheet and the way its depth runs are edited as values of its step', () => {
  const history = editPlate(withPlate(railHistory(), 'part-1'), 'part-2', {
    name: 'Pedal plate',
    widthMm: 200,
    depthMm: 400,
    sheetId: 'aluminium-4',
    processId: 'hand-drilling',
    depthAxis: 'x',
  });
  assert.equal(ofKind(history[1], 'add-plate').name, 'Pedal plate');
  assert.equal(ofKind(history[1], 'add-plate').processId, 'hand-drilling');
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: -200, y: 40, z: 400 },
    max: { x: 200, y: 44, z: 600 },
  });
  assert.equal(
    ofKind(editPlate(history, 'part-2', { name: '  ' })[1], 'add-plate').name,
    'Pedal plate',
  );
});

test('a plate may reach beyond its face, but it must rest on part of it', () => {
  assert.equal(boxOf(withPlate(railHistory(), 'part-1', { acrossMm: 160 }), 'part-2').min.x, 10);
  assert.equal(boxOf(withPlate(railHistory(), 'part-1', { alongMm: 1100 }), 'part-2').min.z, 950);
  assert.throws(
    () => withPlate(railHistory(), 'part-1', { acrossMm: 200 }),
    /Plate 2 would not rest on Rail/,
  );
  assert.throws(
    () => withPlate(railHistory(), 'part-1', { alongMm: 1200 }),
    /Plate 2 would not rest on Rail/,
  );
  const history = withPlate(railHistory(), 'part-1');
  assert.throws(() => editPlate(history, 'part-2', { acrossMm: -200 }), /would not rest on/);
});

test('a plate takes only sizes and sheets the catalog has, its depth along its face', () => {
  assert.throws(
    () => withPlate(railHistory(), 'part-1', { widthMm: 40 }),
    /between 50 and 1500 mm/,
  );
  assert.throws(
    () => withPlate(railHistory(), 'part-1', { depthMm: 1600 }),
    /between 50 and 1500 mm/,
  );
  assert.throws(
    () => withPlate(railHistory(), 'part-1', { sheetId: 'steel-8' }),
    /not in the catalog/,
  );
  assert.throws(
    () => withPlate(railHistory(), 'part-1', { processId: 'plasma' }),
    /plasma is not in the catalog/,
  );
  assert.throws(() => withPlate(railHistory(), 'part-1', { depthAxis: 'y' }), /depth/);
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
  const turned = editProfile(withPlate(railHistory(), 'part-1'), 'part-1', { axis: 'y' });
  assert.match(
    present(replayDesign(turned).failures.get('op-2'), 'failure of op-2'),
    /rests on a side of Rail, not on its end/,
  );
});

test('a plate whose profile is removed stays where it is', () => {
  const history = withPlate(railHistory(), 'part-1', { acrossMm: 30 });
  const removed = removePart(history, 'part-1');
  assert.deepEqual(boxOf(removed, 'part-2'), boxOf(history, 'part-2'));
});

test('nothing grows out of a plate, no foot goes under one and no span reaches one', () => {
  const history = withPlate(railHistory(), 'part-1');
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
  const design = replayDesign(withPlate(railHistory(), 'part-1'));
  assert.deepEqual(
    design.joints.map((joint) => [joint.id, joint.toFace]),
    [['part-2@part-1', '+y']],
  );
  assert.deepEqual(cockpitInterferences(design.resolved), []);
});
