import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contactPointsMm,
  cornersMm,
  partPointMm,
  resolveAssembly,
  anchorWhereItIs,
  type Anchor,
  type Attachment,
  type Axis,
  type Face,
  type FootPart,
  type Part,
  type PeripheralPart,
  type PlatePart,
  type ProfilePart,
  type ResolvedPart,
  type Vec3Mm,
} from '../../../../src/cockpit/cad/parts/assembly.ts';
import { ofKind, present } from '../../../support/lookups.ts';

const SYSTEM = 'motedis-40-i-slot-8';

/** A 40 × 80 profile running along z, its 80 mm side upright. */
const rail = (id: string, xMm: number, lengthMm = 1200): ProfilePart => ({
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
const crossmember = (
  id: string,
  alongMm: number,
  fromEnd: 'start' | 'end' = 'start',
  reachesId = 'right-rail',
): ProfilePart => ({
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

const frame = (...extra: Part[]): Part[] => [
  rail('left-rail', -280),
  rail('right-rail', 280),
  ...extra,
];
const resolvedOf = (parts: readonly Part[], id: string) =>
  present(resolveAssembly(parts).get(id), id);
const boxOf = (parts: readonly Part[], id: string) => resolvedOf(parts, id).box;

test('an anchored profile stands where its start is, with its section from the catalog', () => {
  assert.deepEqual(boxOf(frame(), 'left-rail'), {
    min: { x: -300, y: 60, z: 0 },
    max: { x: -260, y: 140, z: 1200 },
  });
});

test('a span hangs from one face and takes its length from the gap to the facing face', () => {
  const resolved = resolvedOf(frame(crossmember('rear', 100)), 'rear');
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
  const post: ProfilePart = {
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
  const leg: ProfilePart = {
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
  const resolved = resolvedOf([...short, rear], 'rear');
  assert.equal(resolved.openEnd, true);
  assert.equal(resolved.lengthMm, 520);
});

test('a part that hangs from a missing part, or from itself through others, is an error', () => {
  assert.throws(() => resolveAssembly([crossmember('rear', 100)]), /left-rail/);
  const a: ProfilePart = {
    ...rail('a', 0),
    placement: { kind: 'attachment', parentId: 'b', face: '+y', alongMm: 0, fromEnd: 'start' },
  };
  const b: ProfilePart = {
    ...rail('b', 0),
    placement: { kind: 'attachment', parentId: 'a', face: '+y', alongMm: 0, fromEnd: 'start' },
  };
  assert.throws(() => resolveAssembly([a, b]), /depends on itself/);
});

test('a span cannot reach a part that depends on it', () => {
  const post: ProfilePart = {
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
const worldRange = (resolved: ResolvedPart) => {
  const corners = cornersMm(resolved);
  const range = (axis: Axis) => {
    const values = corners.map((corner) => Math.round(corner[axis] * 100) / 100);
    return [Math.min(...values), Math.max(...values)];
  };
  return { x: range('x'), y: range('y'), z: range('z') };
};

const tilted = (tiltDeg: number): ProfilePart => ({
  ...rail('deck-rail', 0, 100),
  sectionId: '40x40',
  placement: { kind: 'anchor', startMm: { x: 0, y: 100, z: 0 }, tiltDeg },
});

test('an untilted part has its box as its world corners', () => {
  const resolved = resolvedOf(frame(), 'left-rail');
  assert.equal(resolved.tiltDeg, 0);
  assert.deepEqual(worldRange(resolved), { x: [-300, -260], y: [60, 140], z: [0, 1200] });
});

test('an anchored part can be locked at a tilt about X that raises its front', () => {
  const upright = resolvedOf([tilted(90)], 'deck-rail');
  assert.equal(upright.tiltDeg, 90);
  assert.deepEqual(worldRange(upright), { x: [-20, 20], y: [100, 200], z: [-20, 20] });
  const raised = worldRange(resolvedOf([tilted(30)], 'deck-rail'));
  assert.ok(raised.y[1] > 140, 'the front end is higher than the start');
});

test('a part hanging from a tilted part is laid out in its tilted frame', () => {
  const post: ProfilePart = {
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
  const resolved = resolvedOf([tilted(90), post], 'post');
  assert.equal(resolved.tiltDeg, 90);
  // Tilted upright, the rail's top face looks back (-z), and its far end is at y = 200.
  assert.deepEqual(worldRange(resolved), { x: [-20, 20], y: [180, 220], z: [-70, -20] });
});

test('a span cannot reach a part at another tilt', () => {
  const across: ProfilePart = {
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

const foot = (
  id: string,
  parentId: string,
  face: Face = '-y',
  footTypeId = 'leveling-foot',
): FootPart => ({
  kind: 'foot',
  id,
  name: id,
  footTypeId,
  placement: { kind: 'attachment', parentId, face, alongMm: 100, fromEnd: 'start' },
});

test('a foot stands under the face it hangs from, as tall and wide as its type', () => {
  const resolved = resolvedOf([...frame(), foot('foot', 'left-rail')], 'foot');
  assert.deepEqual(resolved.box, {
    min: { x: -316, y: 0, z: 64 },
    max: { x: -244, y: 60, z: 136 },
  });
  const caster = resolveAssembly([...frame(), foot('caster', 'left-rail', '-y', 'locking-caster')]);
  assert.deepEqual(present(caster.get('caster'), 'caster').box, {
    min: { x: -300, y: 0, z: 67 },
    max: { x: -260, y: 60, z: 133 },
  });
});

test('a foot hangs only from an underside, and nothing hangs from a foot', () => {
  assert.throws(() => resolveAssembly([...frame(), foot('foot', 'left-rail', '+x')]), /underside/);
  const onFoot: ProfilePart = {
    ...rail('post', 0),
    axis: 'y',
    heightAxis: 'z',
    placement: { kind: 'attachment', parentId: 'foot', face: '+y', alongMm: 0, fromEnd: 'start' },
  };
  assert.throws(
    () => resolveAssembly([...frame(), foot('foot', 'left-rail'), onFoot]),
    /hang from foot/,
  );
});

test('a part can hang from the end face of a profile, centered on it', () => {
  const upright: ProfilePart = {
    ...rail('upright', 0, 200),
    sectionId: '40x40',
    axis: 'y',
    heightAxis: 'z',
    placement: { kind: 'anchor', startMm: { x: 0, y: 60, z: 500 } },
  };
  const under: FootPart = {
    ...foot('foot', 'upright'),
    placement: { ...foot('foot', 'upright').placement, alongMm: 0 },
  };
  assert.deepEqual(resolvedOf([upright, under], 'foot').box, {
    min: { x: -36, y: 0, z: 464 },
    max: { x: 36, y: 60, z: 536 },
  });
  const offCenter = { ...under, placement: { ...under.placement, alongMm: 10 } };
  assert.throws(() => resolveAssembly([upright, offCenter]), /end face/);
});

const plate = (placement: Anchor | Attachment): PlatePart => ({
  kind: 'plate',
  id: 'plate',
  name: 'Pedal plate',
  widthMm: 400,
  depthMm: 300,
  sheetId: 'aluminium-5',
  normal: 'face' in placement ? placement.face : '+y',
  depthAxis: 'z',
  ownHoles: [],
  placement,
});
const pedals = (placement: Anchor | Attachment): PeripheralPart => ({
  kind: 'peripheral',
  id: 'pedals',
  name: 'Pedals',
  category: 'pedals',
  envelope: { widthMm: 300, heightMm: 200, depthMm: 250 },
  mountingPattern: { holes: [] },
  contactPoints: [{ role: 'heel', offsetMm: { x: 0, y: 30, z: -100 } }],
  source: { kind: 'estimated', reference: 'test' },
  facing: '+z',
  placement,
});
const onTop = (parentId: string, alongMm = 0, acrossMm = 0): Attachment => ({
  kind: 'attachment',
  parentId,
  face: '+y',
  alongMm,
  acrossMm,
  fromEnd: 'start',
});

test('an attachment can sit off the center of the face, across it', () => {
  const post: ProfilePart = {
    ...rail('post', 0, 100),
    sectionId: '40x40',
    axis: 'y',
    heightAxis: 'z',
    placement: { ...onTop('left-rail', 100), acrossMm: 10 },
  };
  assert.equal(boxOf([...frame(), post], 'post').min.x, -290);
});

test('a plate lies flat on top of the face it hangs from, or where it is anchored', () => {
  assert.deepEqual(boxOf([...frame(), plate(onTop('left-rail', 500))], 'plate'), {
    min: { x: -480, y: 140, z: 350 },
    max: { x: -80, y: 145, z: 650 },
  });
  const anchored = plate({ kind: 'anchor', startMm: { x: 0, y: 200, z: 0 } });
  assert.deepEqual(boxOf([anchored], 'plate'), {
    min: { x: -200, y: 200, z: -150 },
    max: { x: 200, y: 205, z: 150 },
  });
});

test('a peripheral stands on its mounting origin, and its contact points go with it', () => {
  const parts = [
    plate({ kind: 'anchor', startMm: { x: 0, y: 200, z: 0 } }),
    pedals(onTop('plate', 150, 20)),
  ];
  const resolved = resolvedOf(parts, 'pedals');
  assert.deepEqual(resolved.box, {
    min: { x: -130, y: 205, z: -125 },
    max: { x: 170, y: 405, z: 125 },
  });
  assert.deepEqual(contactPointsMm(resolved), [
    { role: 'heel', pointMm: { x: 20, y: 235, z: -100 } },
  ]);
});

test('a peripheral on a tilted plate leans with it', () => {
  const tiltedPlate = plate({ kind: 'anchor', startMm: { x: 0, y: 0, z: 0 }, tiltDeg: 90 });
  const resolved = resolvedOf([tiltedPlate, pedals(onTop('plate', 150))], 'pedals');
  const [heel] = contactPointsMm(resolved);
  // Turned upright, the plate's top faces back (-z) and its contact offset follows.
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(heel.pointMm).map(([axis, value]) => [axis, Math.round(value) + 0]),
    ),
    { x: 0, y: -100, z: -35 },
  );
});

test('a peripheral mounts on any face, standing out of it and facing the way it is turned', () => {
  const onTheSide = pedals({ ...onTop('left-rail', 600), face: '+x' });
  const resolved = resolvedOf([...frame(), onTheSide], 'pedals');
  assert.deepEqual(resolved.box, {
    min: { x: -260, y: -50, z: 475 },
    max: { x: -60, y: 250, z: 725 },
  });
  assert.deepEqual(contactPointsMm(resolved), [
    { role: 'heel', pointMm: { x: -230, y: 100, z: 500 } },
  ]);
});

test('a peripheral turned on its face takes its depth and contact points along the way it faces', () => {
  const anchored = plate({ kind: 'anchor', startMm: { x: 0, y: 200, z: 0 } });
  const turned: PeripheralPart = { ...pedals(onTop('plate', 150, 20)), facing: '-x' };
  const resolved = resolvedOf([anchored, turned], 'pedals');
  assert.deepEqual(resolved.box, {
    min: { x: -105, y: 205, z: -150 },
    max: { x: 145, y: 405, z: 150 },
  });
  assert.deepEqual(contactPointsMm(resolved), [
    { role: 'heel', pointMm: { x: 120, y: 235, z: 0 } },
  ]);
});

test('a peripheral cannot face out of the face it is mounted on, and nothing hangs from one', () => {
  const facingOut: PeripheralPart = {
    ...pedals({ ...onTop('left-rail'), face: '+x' }),
    facing: '-x',
  };
  assert.throws(() => resolveAssembly([...frame(), facingOut]), /faces/);
  const anchored = plate({ kind: 'anchor', startMm: { x: 0, y: 200, z: 0 } });
  const onPedals = { ...pedals(onTop('pedals')), id: 'more' };
  assert.throws(
    () => resolveAssembly([anchored, pedals(onTop('plate', 150)), onPedals]),
    /hang from peripheral/,
  );
});

test('a plate rests on a side of a profile, its thickness standing out of the face', () => {
  const onTheSide = plate({ ...onTop('left-rail', 500), face: '+x' });
  assert.deepEqual(boxOf([...frame(), onTheSide], 'plate'), {
    min: { x: -260, y: -100, z: 350 },
    max: { x: -255, y: 300, z: 650 },
  });
  const upright: PlatePart = { ...onTheSide, depthAxis: 'y' };
  assert.deepEqual(boxOf([...frame(), upright], 'plate'), {
    min: { x: -260, y: -50, z: 300 },
    max: { x: -255, y: 250, z: 700 },
  });
  const underneath = plate({ ...onTop('left-rail', 500, 30), face: '-y' });
  assert.deepEqual(boxOf([...frame(), underneath], 'plate'), {
    min: { x: -450, y: 55, z: 350 },
    max: { x: -50, y: 60, z: 650 },
  });
});

test('a plate rests on a side of a profile, the way it faces, never on its end', () => {
  const onTheEnd: PlatePart = { ...plate({ ...onTop('left-rail'), face: '+z' }), depthAxis: 'y' };
  assert.throws(() => resolveAssembly([...frame(), onTheEnd]), /end/);
  const facingAway: PlatePart = { ...plate({ ...onTop('left-rail'), face: '+x' }), normal: '+y' };
  assert.throws(() => resolveAssembly([...frame(), facingAway]), /face/);
  const depthOutOfTheFace: PlatePart = { ...plate(onTop('left-rail')), depthAxis: 'y' };
  assert.throws(() => resolveAssembly([...frame(), depthOutOfTheFace]), /depth/);
});

test('a plate that hung from a removed profile is anchored where it is, facing the same way', () => {
  const onTheSide: PlatePart = {
    ...plate({ ...onTop('left-rail', 500), face: '-x' }),
    depthAxis: 'y',
  };
  const where = resolvedOf([...frame(), onTheSide], 'plate');
  const anchor = anchorWhereItIs(where);
  assert.deepEqual(anchor, { kind: 'anchor', startMm: { x: -300, y: 100, z: 500 } });
  const anchored: PlatePart = { ...ofKind(where.part, 'plate'), placement: anchor };
  assert.deepEqual(resolvedOf([anchored], 'plate').box, where.box);
});

test('a point of a standing part is measured from its mounting origin, turned with it', () => {
  const tiltedPlate = plate({ kind: 'anchor', startMm: { x: 0, y: 0, z: 0 }, tiltDeg: 90 });
  const resolved = resolvedOf([tiltedPlate], 'plate');
  // + 0 turns -0 into 0.
  const rounded = (point: Vec3Mm): Vec3Mm => ({
    x: Math.round(point.x) + 0,
    y: Math.round(point.y) + 0,
    z: Math.round(point.z) + 0,
  });
  assert.deepEqual(rounded(partPointMm(resolved, { x: 0, y: 0, z: 0 })), { x: 0, y: 0, z: 0 });
  assert.deepEqual(rounded(partPointMm(resolved, { x: 10, y: 5, z: 100 })), {
    x: 10,
    y: 100,
    z: -5,
  });
  assert.throws(
    () => partPointMm(resolvedOf(frame(), 'left-rail'), { x: 0, y: 0, z: 0 }),
    /profile/,
  );
});

test('a span whose part is not in the design keeps its last length and reports the open end', () => {
  const rear = { ...crossmember('rear', 100), lengthMm: 520 };
  const resolved = resolvedOf([rail('left-rail', -280), rear], 'rear');
  assert.equal(resolved.openEnd, true);
  assert.equal(resolved.lengthMm, 520);
});

test('a part can be anchored where it is, at the tilt of its frame', () => {
  const resolved = resolveAssembly(frame(crossmember('rear', 100)));
  const rear = present(resolved.get('rear'), 'rear');
  const anchored: ProfilePart = {
    ...ofKind(rear.part, 'profile'),
    lengthMm: 520,
    placement: anchorWhereItIs(rear),
  };
  assert.deepEqual(resolvedOf([anchored], 'rear').box, rear.box);
  const deck: ProfilePart = {
    ...rail('deck', 0, 400),
    placement: { kind: 'anchor', startMm: { x: 0, y: 200, z: 300 }, tiltDeg: 12 },
  };
  const tilted = resolvedOf([deck], 'deck');
  const again = resolvedOf([{ ...deck, placement: anchorWhereItIs(tilted) }], 'deck');
  for (const side of ['min', 'max'] as const)
    for (const axis of ['x', 'y', 'z'] as const)
      assert.ok(Math.abs(again.box[side][axis] - tilted.box[side][axis]) < 1e-9);
});
