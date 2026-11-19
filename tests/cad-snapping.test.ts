import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  editProfile,
  type Operation,
  type ProfileValues,
} from '../src/cad/history.ts';
import { ofKind, present } from './support/lookups.ts';
import { operationMaking } from '../src/cad/operations.ts';
import {
  draggedHandle,
  draggedHistory,
  dragFromTyped,
  dragReadout,
  partHandles,
} from '../src/cad/handles.ts';
import { snapToParts } from '../src/cad/snapping.ts';
import { railHistory, withGrowth, withPlate } from './support/designs.ts';

/** Snapping within 10 mm, as about 10 pixels on screen would be at a typical zoom. */
const WITHIN_MM = 10;

/** Another anchored 40 × 40 profile along Z, with the values given. */
const withAnchored = (history: readonly Operation[], changes: Partial<ProfileValues>) => {
  const added = addAnchoredProfile(history);
  return editProfile(added.history, added.partId, changes);
};
/** A profile grown out of part-1 with the values given. */
const handleOf = (history: readonly Operation[], id: string) =>
  present(
    partHandles(history, present(id.split(':')[0], 'part id')).find((handle) => handle.id === id),
    `handle ${id}`,
  );
/** Where the handle `id` snaps when dragged `changeMm`, or null when it snaps to no part. */
const snapped = (history: readonly Operation[], id: string, changeMm: number, symmetric = false) =>
  snapToParts(history, handleOf(history, id), { changeMm, symmetric }, WITHIN_MM);
/** Where the handle `id` snaps when dragged `changeMm`, failing the test when it snaps to none. */
const snapsTo = (history: readonly Operation[], id: string, changeMm: number) =>
  present(snapped(history, id, changeMm), `a snap of ${id}`);

/** The rail, a second rail at x = 500 (its −x face at 480) and a profile out of the rail's +x face. */
const facingRails = () => {
  let history = withAnchored(railHistory(), { startMm: { x: 500, y: 20, z: 0 } });
  history = withGrowth(history, 'part-1', { face: '+x', alongMm: 250, lengthMm: 300 });
  return history;
};

test('a free end near the facing face of a part reaches it, making a span', () => {
  const history = facingRails();
  // The free end is at x = 320; the facing face at 480, a gap of 460 from the rail.
  const { drag, snap } = snapsTo(history, 'part-3:end', 155);
  assert.deepEqual(drag, { changeMm: 160, symmetric: false, reachesId: 'part-2' });
  assert.equal(snap.kind, 'reach');
  const span = ofKind(
    operationMaking(draggedHistory(history, handleOf(history, 'part-3:end'), drag), 'part-3'),
    'grow-profile',
  );
  assert.equal(span.reachesId, 'part-2');
  assert.equal(span.lengthMm, 460);
});

test('the box says a reaching end makes a span, with the length it then has', () => {
  const history = facingRails();
  const readout = dragReadout(history, handleOf(history, 'part-3:end'), {
    changeMm: 160,
    symmetric: false,
    reachesId: 'part-2',
  });
  assert.deepEqual(readout, { kind: 'reach', valueMm: 460 });
});

test('a handle far from every part snaps to none of them', () => {
  assert.equal(snapped(facingRails(), 'part-3:end', 120), null);
});

test('an end lines up with the end of another part nearby', () => {
  const history = withAnchored(railHistory(), { startMm: { x: 300, y: 20, z: 0 }, lengthMm: 800 });
  const { drag, snap } = snapsTo(history, 'part-2:end', 194);
  assert.deepEqual(drag, { changeMm: 200, symmetric: false });
  assert.deepEqual(snap, {
    kind: 'flush',
    guide: { fromMm: { x: 300, y: 20, z: 1000 }, toMm: { x: 0, y: 20, z: 1000 } },
  });
});

test('a moved part lines up either of its faces with those of another part', () => {
  const history = withAnchored(railHistory(), { startMm: { x: 300, y: 20, z: 0 }, lengthMm: 800 });
  assert.deepEqual(snapsTo(history, 'part-2:move:z', 195).drag, {
    changeMm: 200,
    symmetric: false,
  });
  assert.deepEqual(snapsTo(history, 'part-2:move:x', -265).drag, {
    changeMm: -260,
    symmetric: false,
  });
});

test('a part moved on its parent snaps to the middle of its length and of the face across it', () => {
  const growth = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 493, lengthMm: 300 });
  const along = snapsTo(growth, 'part-2:move:z', 2);
  assert.deepEqual(along.drag, { changeMm: 7, symmetric: false });
  assert.equal(along.snap.kind, 'centered');
  const plate = withPlate(railHistory(), 'part-1', { acrossMm: 6 });
  const across = snapsTo(plate, 'part-2:move:x', 0);
  assert.deepEqual(across.drag, { changeMm: -6, symmetric: false });
  assert.equal(across.snap.kind, 'centered');
});

test('a part does not snap to the parts that hang from it, which move with it', () => {
  // The growth's faces are at z = 480 and 520; the rail's start would line up with 480.
  const history = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 500, lengthMm: 300 });
  assert.equal(snapped(history, 'part-1:move:z', 476), null);
});

test('a snap that would take a part off its parent is left out', () => {
  let history = withGrowth(railHistory(), 'part-1', { face: '+y', alongMm: 500, lengthMm: 300 });
  history = withAnchored(history, { startMm: { x: 300, y: 20, z: 1100 }, lengthMm: 400 });
  // The −z face of part-3 at 1100 would put the growth's center at 1080, off the 1000 mm rail.
  assert.equal(snapped(history, 'part-2:move:z', 577), null);
});

test('a value typed for a reaching end lets it go, giving the profile that change', () => {
  const history = facingRails();
  const handle = handleOf(history, 'part-3:end');
  const reaching = { changeMm: 160, symmetric: false, reachesId: 'part-2' };
  assert.deepEqual(dragFromTyped(history, handle, reaching, 100), {
    changeMm: 100,
    symmetric: false,
  });
});

test('a dragged handle stays at the end it moved, even once the profile is a span', () => {
  const history = facingRails();
  const handle = handleOf(history, 'part-3:end');
  const reaching = { changeMm: 160, symmetric: false, reachesId: 'part-2' };
  assert.deepEqual(draggedHandle(handle, reaching).pointMm, { x: 480, y: 20, z: 250 });
  assert.deepEqual(draggedHandle(handle, reaching).outwardMm, handle.outwardMm);
});
