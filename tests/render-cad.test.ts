import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT, type Primitive } from '../src/render-list.ts';
import { allOfKind, present } from './support/lookups.ts';
import {
  resolveAssembly,
  type FootPart,
  type Part,
  type PeripheralPart,
  type PlatePart,
  type ProfilePart,
} from '../src/cad/assembly.ts';
import { drawCadProfiles, drawConnectors } from '../src/render-cad.ts';
import { degToRad } from '../src/shared/geometry.ts';
import { peripheralType } from '../src/cad/catalog.ts';

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
const bars = (primitives: readonly Primitive[]) =>
  allOfKind(primitives, 'box').filter((p) => BAR_MATERIALS.includes(p.material));
const groovesOf = (primitives: readonly Primitive[], bar: { id: number }) =>
  allOfKind(primitives, 'box').filter((p) => p.material === 'groove' && p.parent === bar.id);

test('a profile is drawn as an outlined bar centered on its box, in cm', () => {
  const [bar] = bars(draw([profile('rail')]));
  assert.deepEqual(bar.position, [-28, 10, 60]);
  assert.deepEqual(bar.size, [4, 8, 120]);
  assert.equal(bar.parent, ROOT);
  assert.equal(bar.edges, true);
});

test('an upright 40 × 80 with its wide side across is drawn that way', () => {
  const upright = profile('upright', { axis: 'y', heightAxis: 'x', lengthMm: 500 });
  assert.deepEqual(bars(draw([upright]))[0].size, [8, 50, 4]);
});

test('every section is drawn in any orientation, at its box', () => {
  const across = profile('across', { sectionId: '40x120', axis: 'x', heightAxis: 'z' });
  assert.deepEqual(bars(draw([across]))[0].size, [120, 4, 12]);
  const lying = profile('lying', { axis: 'z', heightAxis: 'x' });
  assert.deepEqual(bars(draw([lying]))[0].size, [8, 4, 120]);
});

test('each long face shows one groove per slot: two on the wide side of a 40 × 80', () => {
  const primitives = draw([profile('rail')]);
  const grooves = groovesOf(primitives, bars(primitives)[0]);
  assert.equal(grooves.length, 6);
  const onSide = grooves.filter((groove) => groove.position[0] > 0);
  assert.deepEqual(
    onSide.map((groove) => groove.position[1]),
    [-2, 2],
  );
  assert.ok(grooves.every((groove) => groove.size[2] < 120 && groove.size[2] > 110));
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
  normal: '+y',
  depthAxis: 'z',
  ownHoles: [],
  placement: { kind: 'attachment', parentId, face: '+y', alongMm: 600, fromEnd: 'start' },
});

test('a plate is drawn as an outlined slab at its box, without grooves', () => {
  const primitives = draw([profile('rail'), plateOn('rail')]);
  const slab = bars(primitives)[1];
  assert.deepEqual(slab.position, [-28, 14.4, 60]);
  assert.deepEqual(slab.size, [30, 0.8, 25]);
  assert.equal(slab.material, 'silver');
  assert.equal(slab.edges, true);
  assert.equal(groovesOf(primitives, slab).length, 0);
});

test('a selected plate, or one about to be added, is drawn as such', () => {
  assert.equal(bars(draw([profile('rail'), plateOn('rail')], 'plate'))[1].material, 'selected');
  assert.equal(
    bars(draw([profile('rail'), plateOn('rail')], null, 'plate'))[1].material,
    'preview',
  );
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
  const tallest = allOfKind(primitives, 'box').reduce((a, b) => (b.size[1] > a.size[1] ? b : a));
  assert.ok(tallest.position[2] < 0);
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
