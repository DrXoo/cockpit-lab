import test from 'node:test';
import assert from 'node:assert/strict';
import { cornersMm, resolveAssembly } from '../src/cad/assembly.ts';

const SYSTEM = 'motedis-40-i-slot-8';

/** A 40 × 80 profile running along z, its 80 mm side upright. */
const rail = (id, xMm, lengthMm = 1200) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: SYSTEM,
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm,
  placement: { kind: 'anchor', startMm: { x: xMm, y: 100, z: 0 } },
});

/** A 40 × 80 crossmember between the inner faces of two rails. */
const crossmember = (id, alongMm, fromEnd = 'start', reachesId = 'right-rail') => ({
  kind: 'profile',
  id,
  name: id,
  systemId: SYSTEM,
  sectionId: '40x80',
  axis: 'x',
  heightAxis: 'y',
  lengthMm: 0,
  placement: {
    kind: 'span',
    parentId: 'left-rail',
    face: '+x',
    alongMm,
    fromEnd,
    reachesId,
  },
});

const frame = (...extra) => [rail('left-rail', -280), rail('right-rail', 280), ...extra];
const boxOf = (parts, id) => resolveAssembly(parts).get(id).box;

test('an anchored profile stands where its start is, with its section from the catalog', () => {
  assert.deepEqual(boxOf(frame(), 'left-rail'), {
    min: { x: -300, y: 60, z: 0 },
    max: { x: -260, y: 140, z: 1200 },
  });
});

test('a span hangs from one face and takes its length from the gap to the facing face', () => {
  const resolved = resolveAssembly(frame(crossmember('rear', 100))).get('rear');
  assert.equal(resolved.lengthMm, 520);
  assert.equal(resolved.openEnd, false);
  assert.deepEqual(resolved.box, {
    min: { x: -260, y: 60, z: 80 },
    max: { x: 260, y: 140, z: 120 },
  });
});

test('an attachment measured from the far end follows that end when the parent lengthens', () => {
  const front = crossmember('front', 100, 'end');
  assert.equal(boxOf(frame(front), 'front').min.z, 1080);
  const longer = [rail('left-rail', -280, 1300), rail('right-rail', 280, 1300), front];
  assert.equal(boxOf(longer, 'front').min.z, 1180);
});

test('a profile grows out of a face, perpendicular to it, and moves with its parent', () => {
  const post = {
    kind: 'profile',
    id: 'post',
    name: 'Seat post',
    systemId: SYSTEM,
    sectionId: '40x40',
    axis: 'y',
    heightAxis: 'z',
    lengthMm: 300,
    placement: { kind: 'attachment', parentId: 'rear', face: '+y', alongMm: 60, fromEnd: 'start' },
  };
  assert.deepEqual(boxOf(frame(crossmember('rear', 100), post), 'post'), {
    min: { x: -220, y: 140, z: 80 },
    max: { x: -180, y: 440, z: 120 },
  });
  assert.equal(boxOf(frame(crossmember('rear', 150), post), 'post').min.z, 130);
});

test('a profile grows downwards out of a lower face', () => {
  const leg = {
    ...rail('leg', 0, 0),
    sectionId: '40x40',
    axis: 'y',
    heightAxis: 'z',
    lengthMm: 50,
    placement: {
      kind: 'attachment',
      parentId: 'left-rail',
      face: '-y',
      alongMm: 0,
      fromEnd: 'start',
    },
  };
  assert.deepEqual(boxOf(frame(leg), 'leg'), {
    min: { x: -300, y: 10, z: -20 },
    max: { x: -260, y: 60, z: 20 },
  });
});

test('a span whose faces stop facing each other keeps its last length and reports the open end', () => {
  const short = [rail('left-rail', -280), { ...rail('right-rail', 280, 500) }];
  const rear = { ...crossmember('rear', 100, 'end'), lengthMm: 520 };
  const resolved = resolveAssembly([...short, rear]).get('rear');
  assert.equal(resolved.openEnd, true);
  assert.equal(resolved.lengthMm, 520);
});

test('a part that hangs from a missing part, or from itself through others, is an error', () => {
  assert.throws(() => resolveAssembly([crossmember('rear', 100)]), /left-rail/);
  const a = {
    ...rail('a', 0),
    placement: { kind: 'attachment', parentId: 'b', face: '+y', alongMm: 0, fromEnd: 'start' },
  };
  const b = {
    ...rail('b', 0),
    placement: { kind: 'attachment', parentId: 'a', face: '+y', alongMm: 0, fromEnd: 'start' },
  };
  assert.throws(() => resolveAssembly([a, b]), /depends on itself/);
});

test('a span cannot reach a part that depends on it', () => {
  const post = {
    ...rail('post', 0),
    axis: 'y',
    heightAxis: 'z',
    placement: { kind: 'attachment', parentId: 'rear', face: '+y', alongMm: 0, fromEnd: 'start' },
  };
  assert.throws(
    () => resolveAssembly(frame(crossmember('rear', 100, 'start', 'post'), post)),
    /depends on itself/,
  );
});

/** World corners rounded to 0.01 mm, as [min, max] per axis. */
const worldRange = (resolved) => {
  const corners = cornersMm(resolved);
  const range = (axis) => {
    const values = corners.map((corner) => Math.round(corner[axis] * 100) / 100);
    return [Math.min(...values), Math.max(...values)];
  };
  return { x: range('x'), y: range('y'), z: range('z') };
};

const tilted = (tiltDeg) => ({
  ...rail('deck-rail', 0, 100),
  sectionId: '40x40',
  placement: { kind: 'anchor', startMm: { x: 0, y: 100, z: 0 }, tiltDeg },
});

test('an untilted part has its box as its world corners', () => {
  const resolved = resolveAssembly(frame()).get('left-rail');
  assert.equal(resolved.tiltDeg, 0);
  assert.deepEqual(worldRange(resolved), { x: [-300, -260], y: [60, 140], z: [0, 1200] });
});

test('an anchored part can be locked at a tilt about X that raises its front', () => {
  const upright = resolveAssembly([tilted(90)]).get('deck-rail');
  assert.equal(upright.tiltDeg, 90);
  assert.deepEqual(worldRange(upright), { x: [-20, 20], y: [100, 200], z: [-20, 20] });
  const raised = worldRange(resolveAssembly([tilted(30)]).get('deck-rail'));
  assert.ok(raised.y[1] > 140, 'the front end is higher than the start');
});

test('a part hanging from a tilted part is laid out in its tilted frame', () => {
  const post = {
    ...rail('post', 0, 50),
    sectionId: '40x40',
    axis: 'y',
    heightAxis: 'z',
    placement: {
      kind: 'attachment',
      parentId: 'deck-rail',
      face: '+y',
      alongMm: 100,
      fromEnd: 'start',
    },
  };
  const resolved = resolveAssembly([tilted(90), post]).get('post');
  assert.equal(resolved.tiltDeg, 90);
  // Tilted upright, the rail's top face looks back (-z), and its far end is at y = 200.
  assert.deepEqual(worldRange(resolved), { x: [-20, 20], y: [180, 220], z: [-70, -20] });
});

test('a span cannot reach a part at another tilt', () => {
  const across = {
    ...crossmember('across', 50, 'start', 'deck-rail'),
    placement: {
      kind: 'span',
      parentId: 'left-rail',
      face: '+x',
      alongMm: 50,
      fromEnd: 'start',
      reachesId: 'deck-rail',
    },
  };
  assert.throws(() => resolveAssembly([...frame(), tilted(10), across]), /tilt/);
});
