import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
} from '../src/cad/history.ts';
import {
  distanceAlongAxis,
  endHandles,
  handlesSeenAlong,
  resizedValues,
  resizeFromTyped,
  resizeReadout,
  snappedResize,
} from '../src/cad/handles.ts';

/** A 40 × 40 rail along Z from the origin, 1000 mm long, lying on the floor: part-1. */
const railHistory = () => {
  const { history, partId } = addAnchoredProfile([]);
  return editProfile(history, partId, { name: 'Rail', lengthMm: 1000 });
};
/** The rail with a profile grown out of it, part-2, changed as given. */
const withGrowth = (changes) => {
  const history = railHistory();
  return addOperation(history, editDraft(history, draftGrowth(history, 'part-1'), changes));
};
const ends = (handles) =>
  handles.map(({ id, end, pointMm, outwardMm }) => [id, end, pointMm, outwardMm]);

test('an anchored profile has a handle at each end, pointing out of it', () => {
  assert.deepEqual(ends(endHandles(railHistory(), 'part-1')), [
    ['part-1:start', 'start', { x: 0, y: 20, z: 0 }, { x: 0, y: 0, z: -1 }],
    ['part-1:end', 'end', { x: 0, y: 20, z: 1000 }, { x: 0, y: 0, z: 1 }],
  ]);
});

test('a profile grown out of a face has a handle only at its free end', () => {
  const up = withGrowth({ face: '+y', alongMm: 500, lengthMm: 300 });
  assert.deepEqual(ends(endHandles(up, 'part-2')), [
    ['part-2:end', 'end', { x: 0, y: 340, z: 500 }, { x: 0, y: 1, z: 0 }],
  ]);
  const down = withGrowth({ face: '-y', alongMm: 500, lengthMm: 300 });
  assert.deepEqual(
    endHandles(down, 'part-2').map(({ end }) => end),
    ['start'],
  );
  const lying = withGrowth({ face: '+y', alongMm: 500, way: '-x', lengthMm: 300 });
  assert.deepEqual(
    endHandles(lying, 'part-2').map(({ end }) => end),
    ['start'],
  );
});

test('a span has no end handles, as its length is the gap it meets', () => {
  let history = railHistory();
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    startMm: { x: 500, y: 20, z: 0 },
  });
  history = addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { face: '+x', alongMm: 250 }),
  );
  history = editProfile(history, 'part-3', { reachesId: 'part-2' });
  assert.deepEqual(endHandles(history, 'part-3'), []);
});

test('dragging an end changes the length, and the start too when it is the start', () => {
  const [rail] = railHistory();
  assert.deepEqual(resizedValues(rail, { end: 'end', symmetric: false, changeMm: 120 }), {
    lengthMm: 1120,
  });
  assert.deepEqual(resizedValues(rail, { end: 'start', symmetric: false, changeMm: 120 }), {
    lengthMm: 1120,
    startMm: { x: 0, y: 20, z: -120 },
  });
  assert.deepEqual(resizedValues(rail, { end: 'end', symmetric: true, changeMm: 60 }), {
    lengthMm: 1120,
    startMm: { x: 0, y: 20, z: -60 },
  });
  const [, grown] = withGrowth({ face: '+y', alongMm: 500, lengthMm: 300 });
  assert.deepEqual(resizedValues(grown, { end: 'end', symmetric: false, changeMm: -50 }), {
    lengthMm: 250,
  });
});

test('a drag lands on lengths in steps of 10 mm, or to the millimetre when free', () => {
  const [rail] = railHistory();
  const short = { ...rail, lengthMm: 495 };
  const snapped = (op, changeMm, symmetric = false, free = false) =>
    snappedResize(op, { end: 'end', symmetric, changeMm }, free).changeMm;
  assert.equal(snapped(rail, 123), 120);
  assert.equal(snapped(short, 7), 5);
  assert.equal(snapped(rail, 33, true), 35, 'symmetric: the whole length lands on a step');
  assert.equal(snapped(rail, 123.4, false, true), 123);
});

test('a drag keeps the length a profile can have', () => {
  const [rail] = railHistory();
  const clamped = (changeMm) =>
    snappedResize(rail, { end: 'end', symmetric: false, changeMm }, false).changeMm;
  assert.equal(clamped(-1200), -990);
  assert.equal(clamped(2500), 2000);
});

test('the box shows the change of one end, or the whole length of a symmetric one', () => {
  const [rail] = railHistory();
  assert.deepEqual(resizeReadout(rail, { end: 'end', symmetric: false, changeMm: 120 }), {
    kind: 'change',
    valueMm: 120,
  });
  assert.deepEqual(resizeReadout(rail, { end: 'end', symmetric: true, changeMm: 35 }), {
    kind: 'length',
    valueMm: 1070,
  });
  const typed = (symmetric, valueMm) =>
    resizeFromTyped(rail, { end: 'end', symmetric, changeMm: 0 }, valueMm).changeMm;
  assert.equal(typed(false, 75), 75);
  assert.equal(typed(true, 1200), 100);
  assert.equal(typed(false, -2000), -990);
});

test('the pointer moves a handle by the nearest point of its ray to the handle axis', () => {
  const along = distanceAlongAxis(
    { originMm: { x: 0, y: 100, z: 500 }, directionMm: { x: 0, y: -1, z: 0 } },
    { x: 0, y: 20, z: 1000 },
    { x: 0, y: 0, z: 1 },
  );
  assert.equal(along, -500);
  const parallel = distanceAlongAxis(
    { originMm: { x: 0, y: 100, z: 500 }, directionMm: { x: 0, y: 0, z: 1 } },
    { x: 0, y: 20, z: 1000 },
    { x: 0, y: 0, z: 1 },
  );
  assert.equal(parallel, null);
});

test('a flat view leaves out the handles that point along its line of sight', () => {
  const upright = editProfile(railHistory(), 'part-1', { axis: 'y' });
  const handles = endHandles(upright, 'part-1');
  assert.equal(handlesSeenAlong(handles, 'y').length, 0);
  assert.equal(handlesSeenAlong(handles, 'x').length, 2);
  assert.equal(handlesSeenAlong(handles, null).length, 2);
  const across = editProfile(railHistory(), 'part-1', { axis: 'x' });
  assert.equal(handlesSeenAlong(endHandles(across, 'part-1'), 'x').length, 0);
});
