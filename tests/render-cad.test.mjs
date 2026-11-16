import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { drawCadProfiles, drawConnectors } from '../src/render-cad.ts';
import { degToRad } from '../src/geometry.ts';

const SYSTEM = 'motedis-40-i-slot-8';
const profile = (id, changes) => ({
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

const draw = (parts, selectedId = null, previewId = null) => {
  const r = createRenderList();
  drawCadProfiles(r, ROOT, resolveAssembly(parts), selectedId, previewId);
  return r.primitives;
};
const bars = (primitives) =>
  primitives.filter(
    (p) => p.kind === 'box' && ['silver', 'selected', 'preview'].includes(p.material),
  );
const groovesOf = (primitives, bar) =>
  primitives.filter((p) => p.kind === 'box' && p.material === 'groove' && p.parent === bar.id);

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
  const tilted = (id, x) =>
    profile(id, {
      sectionId: '40x40',
      lengthMm: 380,
      placement: { kind: 'anchor', startMm: { x, y: 200, z: 500 }, tiltDeg: 15 },
    });
  const primitives = draw([tilted('a', -100), tilted('b', 100)]);
  const groups = primitives.filter((p) => p.kind === 'group');
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].position, [0, 0, 0]);
  assert.deepEqual(groups[0].rotation, [-degToRad(15), 0, 0]);
  assert.ok(bars(primitives).every((bar) => bar.parent === groups[0].id));
});

const foot = {
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
  const pad = primitives.find((p) => p.kind === 'box' && p.material === 'rubber');
  const near = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} is not ${expected}`);
  // The rail's underside is 6 cm up, and a leveling foot is 6 cm tall.
  assert.deepEqual(pad.size, [7.2, 1.5, 7.2]);
  near(pad.position[0], -28, 'under the rail');
  near(pad.position[1], 0.75, 'on the floor');
  near(pad.position[2], 3.6, 'flush with the start');
  const stem = primitives.find((p) => p.kind === 'cylinder');
  assert.equal(stem.material, 'silver');
  near(stem.position[1] + stem.length / 2, 6, 'the stem reaches the underside');
  near(stem.position[1] - stem.length / 2, 1.5, 'and stands on the pad');
});

test('a selected foot is drawn in the accent color', () => {
  const primitives = draw([profile('rail'), foot], 'foot');
  assert.ok(primitives.some((p) => p.kind === 'box' && p.material === 'selected'));
  assert.ok(!primitives.some((p) => p.material === 'rubber'));
});

test('a part about to be added is drawn as a preview', () => {
  const later = profile('b', { placement: { kind: 'anchor', startMm: { x: 300, y: 100, z: 0 } } });
  const primitives = draw([profile('a'), later], 'a', 'b');
  assert.deepEqual(
    bars(primitives).map((bar) => bar.material),
    ['selected', 'preview'],
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
  const plates = r.primitives.filter((p) => p.kind === 'box');
  const rounded = (values) => values.map((value) => Math.round(value * 1000) / 1000);
  assert.deepEqual(
    plates.map((plate) => [rounded(plate.size), rounded(plate.position), plate.material]),
    [
      [[3.6, 4, 0.4], [0, 6, 52.2], 'dark'],
      [[3.6, 0.4, 4], [0, 4.2, 54], 'dark'],
    ],
  );
});
