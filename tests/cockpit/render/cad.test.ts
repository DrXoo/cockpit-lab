import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createRenderList,
  ROOT,
  type ExtrusionPrimitive,
  type Primitive,
} from '../../../src/scene/render-list.ts';
import { profileSectionOutline } from '../../../src/cockpit/render/profile-section.ts';
import { allOfKind, present } from '../../support/lookups.ts';
import {
  resolveAssembly,
  type FootPart,
  type Part,
  type PeripheralPart,
  type PlatePart,
  type ProfilePart,
} from '../../../src/cockpit/cad/parts/assembly.ts';
import {
  drawCadProfiles,
  drawConnectors,
  drawPlateHoles,
} from '../../../src/cockpit/render/cad.ts';
import { degToRad } from '../../../src/shared/geometry.ts';
import {
  MOTEDIS_SERIES_40_SLOT_8,
  peripheralType,
  profileSection,
} from '../../../src/cockpit/cad/parts/catalog.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const profile = (id: string, changes: Partial<ProfilePart> = {}): ProfilePart => ({
  kind: 'profile',
  id,
  name: id,
  systemId: SYSTEM,
  sectionId: '40x80',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 1200,
  placement: { kind: 'anchor', startMm: { x: -280, y: 100, z: 0 } },
  ...changes,
});

const draw = (
  parts: readonly Part[],
  selectedId: string | null = null,
  previewId: string | null = null,
) => {
  const r = createRenderList();
  drawCadProfiles(r, ROOT, resolveAssembly(parts), selectedId, previewId);
  return r.primitives;
};
const BAR_MATERIALS: readonly unknown[] = ['silver', 'selected', 'preview'];
/** The profiles drawn: each its section extruded along its length. */
const bars = (primitives: readonly Primitive[]) =>
  allOfKind(primitives, 'extrusion').filter((p) => BAR_MATERIALS.includes(p.material));
/** The plates drawn: each an outlined slab. */
const slabs = (primitives: readonly Primitive[]) =>
  allOfKind(primitives, 'box').filter((p) => BAR_MATERIALS.includes(p.material));
/** The size an extrusion takes along X, Y and Z, in cm. */
const sizeOf = (bar: ExtrusionPrimitive): number[] => {
  const extent = (index: 0 | 1) => {
    const values = bar.outline.map((point) => point[index]);
    return Math.max(...values) - Math.min(...values);
  };
  const sides = [extent(0), extent(1), bar.length];
  return [0, 1, 2].map((axis) =>
    bar.axes.reduce((sum, direction, side) => sum + Math.abs(direction[axis]) * sides[side], 0),
  );
};

test('a profile is drawn as its section extruded along its length, centered on its box, in cm', () => {
  const [bar] = bars(draw([profile('rail')]));
  assert.deepEqual(bar.position, [-28, 10, 60]);
  assert.deepEqual(sizeOf(bar), [4, 8, 120]);
  assert.deepEqual(bar.axes, [
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ]);
  assert.equal(bar.parent, ROOT);
  assert.equal(bar.edges, true);
  const section = profileSectionOutline(
    MOTEDIS_SERIES_40_SLOT_8,
    profileSection(MOTEDIS_SERIES_40_SLOT_8, '40x80'),
  );
  assert.deepEqual(
    bar.outline,
    section.outer.map(([u, v]) => [u / 10, v / 10]),
    'its slots are cut into its outline',
  );
  assert.equal(bar.holes.length, 2);
});

test('an upright 40 × 80 with its wide side across is drawn that way', () => {
  const upright = profile('upright', { axis: 'y', heightAxis: 'x', lengthMm: 500 });
  assert.deepEqual(sizeOf(bars(draw([upright]))[0]), [8, 50, 4]);
});

test('every section is drawn in any orientation, at its box, in a right-handed frame', () => {
  const across = profile('across', { sectionId: '40x120', axis: 'x', heightAxis: 'z' });
  const [acrossBar] = bars(draw([across]));
  assert.deepEqual(sizeOf(acrossBar), [120, 4, 12]);
  const lying = profile('lying', { axis: 'z', heightAxis: 'x' });
  const [lyingBar] = bars(draw([lying]));
  assert.deepEqual(sizeOf(lyingBar), [8, 4, 120]);
  for (const { axes } of [acrossBar, lyingBar]) {
    const [u, v, w] = axes;
    const cross = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    assert.deepEqual(
      cross.map((value) => value + 0),
      [...w],
    );
  }
});

test('the selected profile is drawn apart from the others', () => {
  const primitives = draw(
    [
      profile('a'),
      profile('b', { placement: { kind: 'anchor', startMm: { x: 300, y: 100, z: 0 } } }),
    ],
    'b',
  );
  assert.deepEqual(
    bars(primitives).map((bar) => bar.material),
    ['silver', 'selected'],
  );
});

test('tilted profiles are drawn in one group turned by their tilt about the origin', () => {
  const tilted = (id: string, x: number) =>
    profile(id, {
      sectionId: '40x40',
      lengthMm: 380,
      placement: { kind: 'anchor', startMm: { x, y: 200, z: 500 }, tiltDeg: 15 },
    });
  const primitives = draw([tilted('a', -100), tilted('b', 100)]);
  const groups = allOfKind(primitives, 'group');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].position, [0, 0, 0]);
  assert.deepEqual(groups[0].rotation, [-degToRad(15), 0, 0]);
  assert.ok(bars(primitives).every((bar) => bar.parent === groups[0].id));
});

const foot: FootPart = {
  kind: 'foot',
  id: 'foot',
  name: 'Foot',
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId: 'rail', face: '-y', alongMm: 36, fromEnd: 'start' },
};

test('feet are not drawn as profiles', () => {
  assert.equal(bars(draw([profile('rail'), foot])).length, 1);
  assert.equal(slabs(draw([profile('rail'), foot])).length, 0);
});

test('a foot is drawn as a rubber pad and a threaded stem up to the underside', () => {
  const primitives = draw([profile('rail'), foot]);
  const pad = present(
    allOfKind(primitives, 'box').find((p) => p.material === 'rubber'),
    'rubber pad',
  );
  const near = (actual: number, expected: number, message: string) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} is not ${expected}`);
  // The rail's underside is 6 cm up, and a leveling foot is 6 cm tall.
  assert.deepEqual(pad.size, [7.2, 1.5, 7.2]);
  near(pad.position[0], -28, 'under the rail');
  near(pad.position[1], 0.75, 'on the floor');
  near(pad.position[2], 3.6, 'flush with the start');
  const stem = present(allOfKind(primitives, 'cylinder')[0], 'stem');
  assert.equal(stem.material, 'silver');
  near(stem.position[1] + stem.length / 2, 6, 'the stem reaches the underside');
  near(stem.position[1] - stem.length / 2, 1.5, 'and stands on the pad');
});

test('a selected foot is drawn in the accent color', () => {
  const primitives = draw([profile('rail'), foot], 'foot');
  assert.ok(primitives.some((p) => p.kind === 'box' && p.material === 'selected'));
  assert.ok(!primitives.some((p) => 'material' in p && p.material === 'rubber'));
});

test('a part about to be added is drawn as a preview', () => {
  const later = profile('b', { placement: { kind: 'anchor', startMm: { x: 300, y: 100, z: 0 } } });
  const primitives = draw([profile('a'), later], 'a', 'b');
  assert.deepEqual(
    bars(primitives).map((bar) => bar.material),
    ['selected', 'preview'],
  );
});

const plateOn = (parentId: string): PlatePart => ({
  kind: 'plate',
  id: 'plate',
  name: 'Plate',
  widthMm: 300,
  depthMm: 250,
  sheetId: 'aluminium-8',
  processId: 'laser-cutting',
  normal: '+y',
  depthAxis: 'z',
  placement: { kind: 'attachment', parentId, face: '+y', alongMm: 600, fromEnd: 'start' },
});

test('a plate is drawn as an outlined slab at its box', () => {
  const primitives = draw([profile('rail'), plateOn('rail')]);
  const [slab] = slabs(primitives);
  assert.deepEqual(slab.position, [-28, 14.4, 60]);
  assert.deepEqual(slab.size, [30, 0.8, 25]);
  assert.equal(slab.material, 'silver');
  assert.equal(slab.edges, true);
});

test('a selected plate, or one about to be added, is drawn as such', () => {
  assert.equal(slabs(draw([profile('rail'), plateOn('rail')], 'plate'))[0].material, 'selected');
  assert.equal(
    slabs(draw([profile('rail'), plateOn('rail')], null, 'plate'))[0].material,
    'preview',
  );
});

test('a plate hole is drawn as a dark plug through the plate, standing just proud of both faces', () => {
  const r = createRenderList();
  const resolved = resolveAssembly([profile('rail'), plateOn('rail')]);
  const hole = {
    kind: 'mounting' as const,
    xMm: 50,
    yMm: 100,
    diameterMm: 9,
    source: 'Seat, hole 1',
  };
  drawPlateHoles(r, ROOT, resolved, new Map([['plate', [hole]]]));
  const [plug] = allOfKind(r.primitives, 'cylinder');
  // Seen from above with its depth (+Z) up the page, the plate's right is the driver's (−X).
  assert.deepEqual(plug.position, [-33, 14.4, 70]);
  assert.equal(plug.radius, 0.45);
  assert.ok(plug.length > 0.8 && plug.length < 0.9, `${plug.length} cm`);
  assert.deepEqual(plug.rotation, [0, 0, 0]);
  assert.equal(plug.material, 'dark');
});

test('a slot is drawn as a dark bar through the plate with a round plug at each end', () => {
  const r = createRenderList();
  const resolved = resolveAssembly([profile('rail'), plateOn('rail')]);
  const slot = {
    kind: 'mounting' as const,
    xMm: 0,
    yMm: 0,
    diameterMm: 10,
    source: 'Wheel base, hole 1',
    slot: { along: 'y' as const, lengthMm: 110 },
  };
  drawPlateHoles(r, ROOT, resolved, new Map([['plate', [slot]]]));
  const [bar] = allOfKind(r.primitives, 'box');
  // Up the drawing is the plate's depth, +Z: the bar runs along it, as long as the straight sides.
  assert.deepEqual([bar.size[0], bar.size[2]], [1, 10]);
  assert.deepEqual(bar.position, [-28, 14.4, 60]);
  assert.equal(bar.material, 'dark');
  const plugs = allOfKind(r.primitives, 'cylinder');
  assert.deepEqual(
    plugs.map((plug) => plug.position),
    [
      [-28, 14.4, 55],
      [-28, 14.4, 65],
    ],
  );
});

test('a hole through a plate on the side of a profile is turned along its normal', () => {
  const r = createRenderList();
  const sidePlate: PlatePart = {
    ...plateOn('rail'),
    normal: '+x',
    placement: { kind: 'attachment', parentId: 'rail', face: '+x', alongMm: 600, fromEnd: 'start' },
  };
  const resolved = resolveAssembly([profile('rail'), sidePlate]);
  const hole = { kind: 'mounting' as const, xMm: 0, yMm: 0, diameterMm: 9, source: 'Seat, hole 1' };
  drawPlateHoles(r, ROOT, resolved, new Map([['plate', [hole]]]));
  const [plug] = allOfKind(r.primitives, 'cylinder');
  assert.deepEqual(plug.rotation, [0, 0, Math.PI / 2]);
});

test('a corner bracket is drawn as an L: a plate against the part, one on the face it meets', () => {
  const r = createRenderList();
  drawConnectors(r, ROOT, [
    {
      id: 'op-3:+z',
      jointId: 'part-2@part-1',
      typeId: 'corner-bracket-40',
      side: '+z',
      name: '40 corner bracket of B',
      toFace: '+y',
      box: { min: { x: -18, y: 40, z: 520 }, max: { x: 18, y: 80, z: 560 } },
      tiltDeg: 0,
    },
  ]);
  const plates = allOfKind(r.primitives, 'box');
  const rounded = (values: readonly number[]) =>
    values.map((value) => Math.round(value * 1000) / 1000);
  assert.deepEqual(
    plates.map((plate) => [rounded(plate.size), rounded(plate.position), plate.material]),
    [
      [[3.6, 4, 0.4], [0, 6, 52.2], 'dark'],
      [[3.6, 0.4, 4], [0, 4.2, 54], 'dark'],
    ],
  );
});

test('a plate bolt is drawn as its head, standing on the plate', () => {
  const r = createRenderList();
  drawConnectors(r, ROOT, [
    {
      id: 'op-4:bolt:1:1',
      jointId: 'part-3@part-1',
      typeId: 'plate-bolt-m8',
      side: '+y',
      name: 'M8 bolt into a T-nut of Plate',
      toFace: '+y',
      box: { min: { x: -106.5, y: 48, z: 418.5 }, max: { x: -93.5, y: 56, z: 431.5 } },
      tiltDeg: 0,
    },
  ]);
  const rounded = (values: readonly number[]) =>
    values.map((value) => Math.round(value * 1000) / 1000);
  assert.deepEqual(
    r.primitives.map((head) => {
      assert.equal(head.kind, 'box');
      return [head.kind, rounded(head.size), rounded(head.position), head.material];
    }),
    [['box', [1.3, 0.8, 1.3], [-10, 5.2, 42.5], 'dark']],
  );
});

const peripheralOf = (typeId: string, changes: Partial<PeripheralPart> = {}): PeripheralPart => {
  const type = peripheralType(typeId);
  return {
    kind: 'peripheral',
    id: typeId,
    name: type.name,
    category: type.category,
    envelope: type.envelope,
    mountingPattern: type.mountingPattern,
    contactPoints: type.contactPoints,
    source: type.source,
    facing: '+z',
    placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 0 } },
    ...changes,
  };
};
interface FittingOptions {
  fitting?: boolean;
  selectedId?: string | null;
  previewId?: string | null;
}
const drawFitting = (
  parts: readonly Part[],
  { fitting = true, selectedId = null, previewId = null }: FittingOptions = {},
) => {
  const r = createRenderList();
  drawCadProfiles(r, ROOT, resolveAssembly(parts), selectedId, previewId, { fitting });
  return r.primitives.filter((p) => p.kind === 'box' || p.kind === 'tube');
};
/** The bounds of the boxes drawn, in mm. */
const boundsMm = (primitives: readonly Primitive[]) => {
  const boxes = allOfKind(primitives, 'box');
  const low = (i: number) => Math.min(...boxes.map((b) => (b.position[i] - b.size[i] / 2) * 10));
  const high = (i: number) => Math.max(...boxes.map((b) => (b.position[i] + b.size[i] / 2) * 10));
  return [0, 1, 2].map((i) => [Math.round(low(i)), Math.round(high(i))]);
};

test('in Fit, a seat is drawn as a base and a backrest that fill its envelope', () => {
  const seat = peripheralOf('generic-seat');
  const primitives = drawFitting([seat]);
  const { widthMm, heightMm, depthMm } = seat.envelope;
  assert.ok(primitives.length >= 2);
  assert.deepEqual(boundsMm(primitives), [
    [-widthMm / 2, widthMm / 2],
    [0, heightMm],
    [-depthMm / 2, depthMm / 2],
  ]);
  // The backrest is at the back, where the driver leans.
  const highest = allOfKind(primitives, 'box').reduce((a, b) =>
    b.position[1] + b.size[1] / 2 > a.position[1] + a.size[1] / 2 ? b : a,
  );
  assert.ok(highest.position[2] < 0);
});

test('a seat stands on a side bracket under each side of its holes, a bolt in every hole', () => {
  const seat = peripheralOf('generic-seat');
  const primitives = drawFitting([seat]);
  const bolts = allOfKind(primitives, 'tube');
  assert.equal(bolts.length, seat.mountingPattern.holes.length);
  const brackets = allOfKind(primitives, 'box').filter((box) => box.material === 'silver');
  const feet = brackets.filter((box) => box.position[1] - box.size[1] / 2 === 0);
  assert.equal(feet.length, 2);
  for (const hole of seat.mountingPattern.holes) {
    const xCm = hole.xMm / 10;
    const zCm = hole.yMm / 10;
    assert.ok(
      bolts.some((bolt) => bolt.from[0] === xCm && bolt.from[2] === zCm && bolt.from[1] === 0),
      `a bolt in the hole at ${hole.xMm}, ${hole.yMm}`,
    );
    const under = (box: (typeof feet)[number], axis: 0 | 2, valueCm: number) =>
      Math.abs(box.position[axis] - valueCm) < box.size[axis] / 2;
    assert.ok(
      feet.some((foot) => under(foot, 0, xCm) && under(foot, 2, zCm)),
      `a bracket under the hole at ${hole.xMm}, ${hole.yMm}`,
    );
  }
});

test('a wheel base has its rim on the side of the driver, within its envelope', () => {
  const wheel = peripheralOf('generic-wheel-base');
  const tubes = drawFitting([wheel]).filter((p) => p.kind === 'tube');
  assert.ok(tubes.length >= 12);
  const { heightMm, depthMm } = wheel.envelope;
  for (const { from } of tubes) {
    assert.ok(from[2] * 10 < -depthMm / 4, 'the rim faces the driver');
    assert.ok(from[1] * 10 >= 0 && from[1] * 10 <= heightMm);
  }
});

test('a peripheral for one hand is a base with a lever up to its grip, within its envelope', () => {
  for (const typeId of [
    'generic-shifter',
    'generic-handbrake',
    'generic-center-stick',
    'generic-side-stick',
    'generic-throttle',
  ]) {
    const control = peripheralOf(typeId, {
      hand: present(peripheralType(typeId).gripHand, typeId),
    });
    const primitives = drawFitting([control]);
    const { widthMm, heightMm, depthMm } = control.envelope;
    const [x, y, z] = boundsMm(primitives);
    assert.ok(x[0] >= -widthMm / 2 && x[1] <= widthMm / 2, typeId);
    assert.ok(y[0] >= 0 && y[1] <= heightMm, typeId);
    assert.ok(z[0] >= -depthMm / 2 && z[1] <= depthMm / 2, typeId);
    const grip = present(
      control.contactPoints.find((contact) => contact.role === 'grip'),
      'grip',
    );
    const lever = allOfKind(primitives, 'tube');
    assert.equal(lever.length, 1, typeId);
    assert.deepEqual(
      lever[0].to.map((value) => Math.round(value * 10)),
      [grip.offsetMm.x, grip.offsetMm.y, grip.offsetMm.z],
      `the lever of ${typeId} ends at its grip`,
    );
  }
});

test('a peripheral turned on its face is drawn turned', () => {
  const pedals = peripheralOf('generic-pedals', { facing: '-x' });
  const { widthMm, depthMm } = pedals.envelope;
  const [x, , z] = boundsMm(drawFitting([pedals]));
  assert.deepEqual(x, [-depthMm / 2, depthMm / 2]);
  assert.deepEqual(z, [-widthMm / 2, widthMm / 2]);
});

test('out of Fit a peripheral is drawn grey, as a reference; in Fit selected or previewed as a part', () => {
  const pedals = peripheralOf('generic-pedals');
  const materials = (options: FittingOptions) =>
    new Set(drawFitting([pedals], options).map((p) => p.material));
  assert.deepEqual(materials({ fitting: false }), new Set(['reference']));
  assert.deepEqual(
    materials({ fitting: false, selectedId: 'generic-pedals' }),
    new Set(['reference']),
  );
  assert.deepEqual(materials({ selectedId: 'generic-pedals' }), new Set(['selected']));
  assert.deepEqual(materials({ previewId: 'generic-pedals' }), new Set(['preview']));
});
