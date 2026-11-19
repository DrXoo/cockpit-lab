import test from 'node:test';
import assert from 'node:assert/strict';
import {
  draftGrowth,
  editProfile,
  growthAt,
  replayDesign,
  replayHistory,
  type Operation,
} from '../src/cad/history.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { railHistory, withGrowth } from './support/designs.ts';
import { ofKind, present } from './support/lookups.ts';

const boxOf = (history: readonly Operation[], partId: string) =>
  present(resolveAssembly(replayHistory(history)).get(partId), partId).box;
const growth = (history: readonly Operation[]) => ofKind(history[1], 'grow-profile');

test('a profile grows out of a face of another, perpendicular, where its distance puts it', () => {
  const history = withGrowth(railHistory(), 'part-1', {
    face: '+y',
    fromEnd: 'start',
    alongMm: 100,
    lengthMm: 300,
  });
  assert.equal(history[1].kind, 'grow-profile');
  assert.equal(history[1].partId, 'part-2');
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: -20, y: 40, z: 80 },
    max: { x: 20, y: 340, z: 120 },
  });
});

test('the distance is measured from either end, and the offset moves it across the face', () => {
  const history = withGrowth(railHistory(), 'part-1', {
    face: '+x',
    fromEnd: 'end',
    alongMm: 200,
    acrossMm: 10,
    lengthMm: 300,
  });
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: 20, y: 10, z: 780 },
    max: { x: 320, y: 50, z: 820 },
  });
});

test('a profile grown out of an underside hangs down, and out of an end it carries on', () => {
  const down = withGrowth(railHistory(), 'part-1', { face: '-y', alongMm: 500, lengthMm: 100 });
  assert.deepEqual(boxOf(down, 'part-2').min.y, -100);
  assert.deepEqual(boxOf(down, 'part-2').max.y, 0);
  const onwards = withGrowth(railHistory(), 'part-1', { face: '+z', lengthMm: 200 });
  assert.deepEqual(boxOf(onwards, 'part-2'), {
    min: { x: -20, y: 0, z: 1000 },
    max: { x: 20, y: 40, z: 1200 },
  });
});

test('a new growth starts from the middle of the top, or of the front of an upright', () => {
  const draft = draftGrowth(railHistory(), 'part-1');
  assert.deepEqual(
    {
      kind: draft.kind,
      id: draft.id,
      partId: draft.partId,
      parentId: draft.parentId,
      name: draft.name,
      sectionId: draft.sectionId,
      face: draft.face,
      fromEnd: draft.fromEnd,
      alongMm: draft.alongMm,
      acrossMm: draft.acrossMm,
      way: draft.way,
      lengthMm: draft.lengthMm,
    },
    {
      kind: 'grow-profile',
      id: 'op-2',
      partId: 'part-2',
      parentId: 'part-1',
      name: '40 × 40 profile 2',
      sectionId: '40x40',
      face: '+y',
      fromEnd: 'start',
      alongMm: 500,
      acrossMm: 0,
      way: 'out',
      lengthMm: 500,
    },
  );
  const upright = editProfile(railHistory(), 'part-1', { axis: 'y' });
  assert.equal(draftGrowth(upright, 'part-1').face, '+z');
});

test('moving or lengthening a part carries along what grows out of it', () => {
  const history = withGrowth(railHistory(), 'part-1', {
    fromEnd: 'end',
    alongMm: 100,
    lengthMm: 300,
  });
  const moved = editProfile(history, 'part-1', { startMm: { x: 100, y: 20, z: 50 } });
  assert.deepEqual(boxOf(moved, 'part-2').min, { x: 80, y: 40, z: 930 });
  const longer = editProfile(history, 'part-1', { lengthMm: 1500 });
  assert.deepEqual(boxOf(longer, 'part-2').min.z, 1380);
});

test('a grown profile edits its place on the face rather than a position of its own', () => {
  const history = withGrowth(railHistory(), 'part-1', { lengthMm: 300 });
  const edited = editProfile(history, 'part-2', { alongMm: 250, acrossMm: -5, lengthMm: 400 });
  assert.deepEqual(boxOf(edited, 'part-2'), {
    min: { x: -25, y: 40, z: 230 },
    max: { x: 15, y: 440, z: 270 },
  });
  assert.throws(() => editProfile(history, 'part-2', { startMm: { x: 0, y: 0, z: 0 } }), /Rail/);
  assert.throws(() => editProfile(history, 'part-2', { axis: 'x' }), /Rail/);
});

test('moving a growth to another face turns its section when it has to', () => {
  let history = withGrowth(railHistory(), 'part-1', { sectionId: '40x80', heightAxis: 'x' });
  history = editProfile(history, 'part-2', { face: '+x' });
  assert.equal(growth(history).heightAxis, 'y');
  const onEnd = editProfile(history, 'part-2', { face: '-z' });
  assert.equal(growth(onEnd).alongMm, 0, 'an end face has a single place to grow from: its center');
  assert.equal(growth(onEnd).acrossMm, 0);
});

test('a growth must stay on its parent face, and fails when its parent leaves it hanging', () => {
  const history = withGrowth(railHistory(), 'part-1', { fromEnd: 'start', alongMm: 900 });
  assert.throws(() => editProfile(history, 'part-2', { alongMm: 1001 }), /Rail/);
  assert.throws(() => editProfile(history, 'part-2', { acrossMm: 21 }), /Rail/);
  assert.throws(() => editProfile(history, 'part-2', { alongMm: -1 }), /distance/);
  const shorter = editProfile(history, 'part-1', { lengthMm: 800 });
  assert.match(
    present(replayDesign(shorter).failures.get('op-2'), 'failure of op-2'),
    /40 × 40 profile 2 would hang off Rail/,
  );
  // @ts-expect-error: a face no part has, as a file could hold, is rejected.
  assert.throws(() => editProfile(history, 'part-2', { face: '+w' }), /face/);
  assert.throws(() => withGrowth(railHistory(), 'part-7'), /part-7/);
});

test('a click on a face of the parent puts the growth there, measured from the nearer end', () => {
  const history = railHistory();
  const draft = draftGrowth(history, 'part-1');
  const nearStart = growthAt(history, draft, '+x', { x: 20, y: 30, z: 120.4 });
  assert.equal(nearStart.face, '+x');
  assert.equal(nearStart.fromEnd, 'start');
  assert.equal(nearStart.alongMm, 120);
  assert.equal(nearStart.acrossMm, 0, 'it grows from the middle of the face, where the slot is');
  const nearEnd = growthAt(history, draft, '+y', { x: 5, y: 40, z: 700 });
  assert.equal(nearEnd.fromEnd, 'end');
  assert.equal(nearEnd.alongMm, 300);
  assert.equal(growthAt(history, draft, '-z', { x: 0, y: 20, z: 0 }).alongMm, 0);
});

test('a profile can lie along a face, running the way it is given from its place there', () => {
  const forward = withGrowth(railHistory(), 'part-1', {
    face: '+y',
    way: '+z',
    fromEnd: 'start',
    alongMm: 100,
    lengthMm: 300,
  });
  assert.equal(growth(forward).way, '+z');
  assert.deepEqual(boxOf(forward, 'part-2'), {
    min: { x: -20, y: 40, z: 100 },
    max: { x: 20, y: 80, z: 400 },
  });
  const sideways = withGrowth(railHistory(), 'part-1', { way: '-x', lengthMm: 300 });
  assert.deepEqual(boxOf(sideways, 'part-2'), {
    min: { x: -300, y: 40, z: 480 },
    max: { x: 0, y: 80, z: 520 },
  });
});

test('a profile lying on a face rests its whole section on it', () => {
  const history = withGrowth(railHistory(), 'part-1', {
    face: '+x',
    way: '+z',
    sectionId: '40x80',
    heightAxis: 'x',
    alongMm: 0,
    lengthMm: 200,
  });
  assert.deepEqual(boxOf(history, 'part-2'), {
    min: { x: 20, y: 0, z: 0 },
    max: { x: 100, y: 40, z: 200 },
  });
});

test('a profile cannot lie towards the face it lies on, and a new face keeps it lying', () => {
  const lying = withGrowth(railHistory(), 'part-1', { way: '+x' });
  assert.throws(() => editProfile(lying, 'part-2', { way: '+y' }), /way/);
  const moved = editProfile(lying, 'part-2', { face: '+x' });
  assert.equal(growth(moved).way, '+z', 'it turns to lie along the part it grows from');
  assert.equal(growth(editProfile(lying, 'part-2', { way: 'out' })).way, 'out');
});
