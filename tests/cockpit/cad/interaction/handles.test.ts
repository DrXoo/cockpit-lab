import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  type MakingOperation,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import { allOfKind, ofKind, present } from '../../../support/lookups.ts';
import { draftPlate } from '../../../../src/cockpit/cad/history/plates.ts';
import { draftPeripheral } from '../../../../src/cockpit/cad/history/peripherals.ts';
import { operationMaking } from '../../../../src/cockpit/cad/history/operations.ts';
import {
  distanceAlongAxis,
  draggedHistory,
  dragFromTyped,
  dragReadout,
  handlesSeenAlong,
  partHandles,
  snappedDrag,
  symmetricDrag,
  travelHandles,
  type EndHandle,
} from '../../../../src/cockpit/cad/interaction/handles.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';
import { snapToParts } from '../../../../src/cockpit/cad/interaction/snapping.ts';
import {
  railHistory,
  seatRails,
  withGrowth,
  withPeripheral,
  withPlate,
} from '../../../support/designs.ts';

const ends = (handles: readonly EndHandle[]) =>
  handles.map(({ id, end, pointMm, outwardMm }) => [id, end, pointMm, outwardMm]);
const endHandles = (history: readonly Operation[], partId: string) =>
  allOfKind(partHandles(history, partId), 'end');
/** The handle with this id, as `part-1:end`. */
const partOf = (handleId: string) => present(handleId.split(':')[0], `the part of ${handleId}`);
const handleOf = (history: readonly Operation[], id: string) =>
  present(
    partHandles(history, partOf(id)).find((handle) => handle.id === id),
    `handle ${id}`,
  );
/** The values of the part's operation once its handle `id` is dragged. */
const dragged = (
  history: readonly Operation[],
  id: string,
  changeMm: number,
  symmetric = false,
): MakingOperation => {
  const partId = partOf(id);
  const changed = draggedHistory(history, handleOf(history, id), { changeMm, symmetric });
  return present(operationMaking(changed, partId), partId);
};

test('an anchored profile has a handle at each end, pointing out of it', () => {
  assert.deepEqual(ends(endHandles(railHistory(), 'part-1')), [
    ['part-1:start', 'start', { x: 0, y: 20, z: 0 }, { x: 0, y: 0, z: -1 }],
    ['part-1:end', 'end', { x: 0, y: 20, z: 1000 }, { x: 0, y: 0, z: 1 }],
  ]);
});

test('a profile grown out of a face has a handle only at its free end', () => {
  const up = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 500, lengthMm: 300 });
  assert.deepEqual(ends(endHandles(up, 'part-2')), [
    ['part-2:end', 'end', { x: 0, y: 340, z: 500 }, { x: 0, y: 1, z: 0 }],
  ]);
  const down = withGrowth(railHistory(), 'part-1', { face: '-y', alongMm: 500, lengthMm: 300 });
  assert.deepEqual(
    endHandles(down, 'part-2').map(({ end }) => end),
    ['start'],
  );
  const lying = withGrowth(railHistory(), 'part-1', {
    face: '+y',
    alongMm: 500,
    way: '-x',
    lengthMm: 300,
  });
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
  const rail = railHistory();
  const lengthAndStart = (operation: MakingOperation) => {
    const { lengthMm, startMm } = ofKind(operation, 'add-anchored-profile');
    return { lengthMm, startMm };
  };
  assert.deepEqual(lengthAndStart(dragged(rail, 'part-1:end', 120)), {
    lengthMm: 1120,
    startMm: { x: 0, y: 20, z: 0 },
  });
  assert.deepEqual(lengthAndStart(dragged(rail, 'part-1:start', 120)), {
    lengthMm: 1120,
    startMm: { x: 0, y: 20, z: -120 },
  });
  assert.deepEqual(lengthAndStart(dragged(rail, 'part-1:end', 60, true)), {
    lengthMm: 1120,
    startMm: { x: 0, y: 20, z: -60 },
  });
  const grown = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 500, lengthMm: 300 });
  assert.equal(
    ofKind(dragged(grown, 'part-2:end', -50, true), 'grow-profile').lengthMm,
    250,
    'one end only',
  );
});

test('a drag lands on lengths in steps of 10 mm, or to the millimetre when free', () => {
  const rail = railHistory();
  const short = editProfile(rail, 'part-1', { lengthMm: 495 });
  const snapped = (
    history: readonly Operation[],
    changeMm: number,
    symmetric = false,
    free = false,
  ) =>
    snappedDrag(history, handleOf(history, 'part-1:end'), { symmetric, changeMm }, free).changeMm;
  assert.equal(snapped(rail, 123), 120);
  assert.equal(snapped(short, 7), 5);
  assert.equal(snapped(rail, 33, true), 35, 'symmetric: the whole length lands on a step');
  assert.equal(snapped(rail, 123.4, false, true), 123);
});

test('a drag keeps the length a profile can have', () => {
  const rail = railHistory();
  const clamped = (changeMm: number) =>
    snappedDrag(rail, handleOf(rail, 'part-1:end'), { symmetric: false, changeMm }, false).changeMm;
  assert.equal(clamped(-1200), -990);
  assert.equal(clamped(2500), 2000);
});

test('the box shows the change of one end, or the whole length of a symmetric one', () => {
  const rail = railHistory();
  const end = handleOf(rail, 'part-1:end');
  assert.deepEqual(dragReadout(rail, end, { symmetric: false, changeMm: 120 }), {
    kind: 'change',
    valueMm: 120,
  });
  assert.deepEqual(dragReadout(rail, end, { symmetric: true, changeMm: 35 }), {
    kind: 'length',
    valueMm: 1070,
  });
  const typed = (symmetric: boolean, valueMm: number) =>
    dragFromTyped(rail, end, { symmetric, changeMm: 0 }, valueMm).changeMm;
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

const moves = (history: readonly Operation[], partId: string) =>
  allOfKind(partHandles(history, partId), 'move').map(({ id, pointMm, outwardMm }) => [
    id,
    pointMm,
    outwardMm,
  ]);

test('an anchored part moves along the three axes, from its center', () => {
  assert.deepEqual(moves(railHistory(), 'part-1'), [
    ['part-1:move:x', { x: 0, y: 20, z: 500 }, { x: 1, y: 0, z: 0 }],
    ['part-1:move:y', { x: 0, y: 20, z: 500 }, { x: 0, y: 1, z: 0 }],
    ['part-1:move:z', { x: 0, y: 20, z: 500 }, { x: 0, y: 0, z: 1 }],
  ]);
});

test('a part that hangs from another moves along and across the face it hangs from', () => {
  const up = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 500, lengthMm: 300 });
  assert.deepEqual(moves(up, 'part-2'), [
    ['part-2:move:z', { x: 0, y: 190, z: 500 }, { x: 0, y: 0, z: 1 }],
    ['part-2:move:x', { x: 0, y: 190, z: 500 }, { x: 1, y: 0, z: 0 }],
  ]);
  assert.deepEqual(
    moves(withPlate(railHistory(), 'part-1'), 'part-2').map(([id]) => id),
    ['part-2:move:z', 'part-2:move:x'],
  );
  const { history: footed } = addFoot(railHistory(), 'part-1');
  assert.deepEqual(
    moves(footed, 'part-2').map(([id]) => id),
    ['part-2:move:z'],
    'a foot stays under the middle of its profile',
  );
});

test('a seat between two rails moves only along them: across, the rails place it', () => {
  const between = withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: 'part-2' });
  assert.deepEqual(
    moves(between, 'part-3').map(([id]) => id),
    ['part-3:move:z'],
  );
  const onOne = withPeripheral(seatRails(), 'part-1', 'generic-seat', { betweenId: null });
  assert.deepEqual(
    moves(onOne, 'part-3').map(([id]) => id),
    ['part-3:move:z', 'part-3:move:x'],
  );
});

test('a part grown out of an end has nowhere to move on it', () => {
  const onTheEnd = withGrowth(railHistory(), 'part-1', { face: '+z', alongMm: 0, lengthMm: 300 });
  assert.deepEqual(moves(onTheEnd, 'part-2'), []);
});

test('moving an anchored part changes its start', () => {
  assert.deepEqual(
    ofKind(dragged(railHistory(), 'part-1:move:x', 120), 'add-anchored-profile').startMm,
    {
      x: 120,
      y: 20,
      z: 0,
    },
  );
});

test('moving a hanging part changes how far along and across its parent it is', () => {
  const fromStart = withGrowth(railHistory(), 'part-1', {
    face: '+y',
    alongMm: 500,
    lengthMm: 300,
  });
  assert.equal(ofKind(dragged(fromStart, 'part-2:move:z', 100), 'grow-profile').alongMm, 600);
  assert.equal(ofKind(dragged(fromStart, 'part-2:move:x', -10), 'grow-profile').acrossMm, -10);
  const fromEnd = withGrowth(railHistory(), 'part-1', {
    face: '+y',
    fromEnd: 'end',
    alongMm: 500,
    lengthMm: 300,
  });
  assert.equal(
    ofKind(dragged(fromEnd, 'part-2:move:z', 100), 'grow-profile').alongMm,
    400,
    'measured from the far end',
  );
  assert.equal(
    ofKind(dragged(withPlate(railHistory(), 'part-1'), 'part-2:move:x', 60), 'add-plate').acrossMm,
    60,
  );
});

test('a move that would take a part off its parent is refused', () => {
  const up = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 500, lengthMm: 300 });
  const along = handleOf(up, 'part-2:move:z');
  assert.throws(() => draggedHistory(up, along, { changeMm: 600, symmetric: false }));
});

test('a move lands on positions in steps of 10 mm, or to the millimetre when free', () => {
  const up = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 505, lengthMm: 300 });
  const along = handleOf(up, 'part-2:move:z');
  const snapped = (changeMm: number, free = false) =>
    snappedDrag(up, along, { changeMm, symmetric: false }, free).changeMm;
  assert.equal(snapped(123), 125, 'to 630 mm along');
  assert.equal(snapped(123.4, true), 123);
  const fromEnd = withGrowth(railHistory(), 'part-1', {
    face: '+y',
    fromEnd: 'end',
    alongMm: 505,
    lengthMm: 300,
  });
  assert.equal(
    snappedDrag(
      fromEnd,
      handleOf(fromEnd, 'part-2:move:z'),
      { changeMm: 3, symmetric: false },
      false,
    ).changeMm,
    5,
    'to 500 mm from the far end',
  );
});

test('the box shows how far a part moved, and a typed value moves it that far', () => {
  const rail = railHistory();
  const move = handleOf(rail, 'part-1:move:y');
  assert.deepEqual(dragReadout(rail, move, { changeMm: 30, symmetric: true }), {
    kind: 'move',
    valueMm: 30,
  });
  assert.deepEqual(dragFromTyped(rail, move, { changeMm: 30, symmetric: false }, 45.4), {
    changeMm: 45,
    symmetric: false,
  });
});

const edges = (history: readonly Operation[], partId: string) =>
  allOfKind(partHandles(history, partId), 'edge').map(({ id, pointMm, outwardMm }) => [
    id,
    pointMm,
    outwardMm,
  ]);

test('a plate has a handle at the middle of each edge, pointing out across it', () => {
  // 300 × 300 × 8 mm on top of the rail, centered 500 mm along it.
  assert.deepEqual(edges(withPlate(railHistory(), 'part-1'), 'part-2'), [
    ['part-2:edge:-x', { x: -150, y: 44, z: 500 }, { x: -1, y: 0, z: 0 }],
    ['part-2:edge:+x', { x: 150, y: 44, z: 500 }, { x: 1, y: 0, z: 0 }],
    ['part-2:edge:-z', { x: 0, y: 44, z: 350 }, { x: 0, y: 0, z: -1 }],
    ['part-2:edge:+z', { x: 0, y: 44, z: 650 }, { x: 0, y: 0, z: 1 }],
  ]);
  assert.deepEqual(edges(railHistory(), 'part-1'), [], 'a profile has ends, not edges');
});

test('dragging an edge of a plate changes that side, keeping the far edge where it was', () => {
  const plate = withPlate(railHistory(), 'part-1');
  const sides = (operation: MakingOperation) => {
    const { widthMm, depthMm, alongMm, acrossMm } = ofKind(operation, 'add-plate');
    return { widthMm, depthMm, alongMm, acrossMm };
  };
  assert.deepEqual(sides(dragged(plate, 'part-2:edge:+x', 50)), {
    widthMm: 350,
    depthMm: 300,
    alongMm: 500,
    acrossMm: 25,
  });
  assert.deepEqual(sides(dragged(plate, 'part-2:edge:-z', 40)), {
    widthMm: 300,
    depthMm: 340,
    alongMm: 480,
    acrossMm: 0,
  });
  assert.deepEqual(sides(dragged(plate, 'part-2:edge:+z', 20, true)), {
    widthMm: 300,
    depthMm: 340,
    alongMm: 500,
    acrossMm: 0,
  });
  const fromEnd = withPlate(railHistory(), 'part-1', { fromEnd: 'end' });
  assert.equal(
    ofKind(dragged(fromEnd, 'part-2:edge:+z', 40), 'add-plate').alongMm,
    480,
    'measured from the far end',
  );
});

test('an edge lands on sides in steps of 10 mm, within the sides a plate can have', () => {
  const plate = withPlate(railHistory(), 'part-1');
  const snapped = (id: string, changeMm: number, symmetric = false) =>
    snappedDrag(plate, handleOf(plate, id), { changeMm, symmetric }, false).changeMm;
  assert.equal(snapped('part-2:edge:+x', 23), 20);
  assert.equal(snapped('part-2:edge:+x', 7, true), 5, 'symmetric: the whole side lands on a step');
  assert.equal(snapped('part-2:edge:-x', -400), -250, 'down to 50 mm');
});

test('the box shows the change of one edge, or the whole width or depth of a symmetric one', () => {
  const plate = withPlate(railHistory(), 'part-1');
  const across = handleOf(plate, 'part-2:edge:+x');
  const along = handleOf(plate, 'part-2:edge:-z');
  assert.deepEqual(dragReadout(plate, across, { changeMm: 20, symmetric: false }), {
    kind: 'change',
    valueMm: 20,
  });
  assert.deepEqual(dragReadout(plate, across, { changeMm: 20, symmetric: true }), {
    kind: 'width',
    valueMm: 340,
  });
  assert.deepEqual(dragReadout(plate, along, { changeMm: -50, symmetric: true }), {
    kind: 'depth',
    valueMm: 200,
  });
  assert.equal(dragFromTyped(plate, along, { changeMm: 0, symmetric: true }, 400).changeMm, 50);
});

test('a plate grows on both sides of its center, and Shift moves only the dragged edge', () => {
  const plate = handleOf(withPlate(railHistory(), 'part-1'), 'part-2:edge:+x');
  assert.equal(symmetricDrag(plate, false), true);
  assert.equal(symmetricDrag(plate, true), false);
  const end = handleOf(railHistory(), 'part-1:end');
  assert.equal(symmetricDrag(end, false), false);
  assert.equal(symmetricDrag(end, true), true);
});

test('a peripheral moves along and across the face it is mounted on, along the depth of a plate', () => {
  const plated = withPlate(railHistory(), 'part-1', { depthAxis: 'x' });
  const history = addOperation(plated, draftPeripheral(plated, 'part-2', 'generic-pedals'));
  assert.deepEqual(
    moves(history, 'part-3').map(([id]) => id),
    ['part-3:move:x', 'part-3:move:z'],
  );
  assert.equal(ofKind(dragged(history, 'part-3:move:x', 40), 'mount-peripheral').alongMm, 190);
  assert.equal(ofKind(dragged(history, 'part-3:move:z', -30), 'mount-peripheral').acrossMm, -30);
  assert.equal(partHandles(history, 'part-3').filter(({ kind }) => kind !== 'move').length, 0);
});

/** The rail with a plate on the middle of its top, part-2, 20 mm along a 100 mm travel. */
const slidPlate = () => {
  const history = railHistory();
  const plated = addAdjustment(addOperation(history, draftPlate(history, 'part-1')), 'part-2');
  return editAdjustment(plated, 'part-2', { positionMm: 20 });
};

test('a part with an adjustment has one arrow along its travel, which runs on the face it hangs from', () => {
  const history = slidPlate();
  const [handle, ...others] = travelHandles(history, 'part-2');
  assert.equal(others.length, 0);
  assert.deepEqual(
    [handle.kind, handle.id, handle.axis, handle.outwardMm],
    ['travel', 'part-2:travel', 'z', { x: 0, y: 0, z: 1 }],
  );
  assert.equal(handle.pointMm.z, 520, 'where the part is');
  assert.deepEqual(
    [handle.travel.centerMm.z, handle.travel.fromMm.z, handle.travel.toMm.z],
    [500, 450, 550],
  );
  assert.equal(handle.pointMm.y, 44, 'the arrow at the center of the 8 mm plate');
  assert.equal(handle.travel.centerMm.y, 40, 'its travel on the top of the rail');
  assert.deepEqual(travelHandles(railHistory(), 'part-1'), [], 'a part that does not slide');
  const moveArrow = present(allOfKind(partHandles(history, 'part-2'), 'move')[0], 'move arrow');
  assert.equal(moveArrow.pointMm.z, 520, 'every handle is where the part is drawn');
});

test('dragging along a travel moves the part in steps, never past either end', () => {
  const history = slidPlate();
  const [handle] = travelHandles(history, 'part-2');
  const drag = (changeMm: number, free = false) =>
    snappedDrag(history, handle, { changeMm, symmetric: false }, free).changeMm;
  assert.equal(drag(13), 10);
  assert.equal(drag(13, true), 13);
  assert.equal(drag(100), 30);
  assert.equal(drag(-100), -70);
  const requested = { changeMm: 30, symmetric: false };
  assert.deepEqual(dragReadout(history, handle, requested), { kind: 'position', valueMm: 50 });
  const dragged = draggedHistory(history, handle, requested);
  assert.equal(dragged.length, history.length, 'it adds no step');
  assert.equal(present(ofKind(dragged[1], 'add-plate').adjustment, 'adjustment').positionMm, 50);
  assert.equal(dragFromTyped(history, handle, requested, -60).changeMm, -70);
  assert.equal(dragFromTyped(history, handle, requested, 5).changeMm, -15);
  assert.equal(snapToParts(history, handle, requested, 10), null, 'a travel does not snap');
});
