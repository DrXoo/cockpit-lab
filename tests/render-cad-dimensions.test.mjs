import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../src/render-list.ts';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { drawPartLength, drawPlacementAlong } from '../src/render-cad-dimensions.ts';

const SYSTEM = 'motedis-40-i-slot-8';
// A 40 × 80 rail from front to back: x −300…−260, y 60…140, z 0…1200 mm.
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
const foot = {
  kind: 'foot',
  id: 'foot',
  name: 'Foot',
  footTypeId: 'leveling-foot',
  placement: { kind: 'attachment', parentId: 'rail', face: '-y', alongMm: 36, fromEnd: 'start' },
};

const draw = (parts, selectedId, view = 'iso') => {
  const r = createRenderList();
  drawPartLength(r, ROOT, resolveAssembly(parts), selectedId, view);
  return r;
};
const rounded = (point) => point.map((value) => Math.round(value * 1000) / 1000);
/** The measured line: the first line drawn, between the two ends of the part. */
const measuredLine = (r) => r.primitives.find((p) => p.kind === 'line').points.map(rounded);

test('the selected profile shows its length in mm, along it and above it in 3D', () => {
  const r = draw([profile('rail')], 'rail');
  assert.deepEqual(
    r.labels.map((label) => label.text),
    ['1200 mm'],
  );
  assert.equal(r.labels[0].measures, 'part-length');
  assert.deepEqual(rounded(Object.values(r.labels[0].position)), [-28, 24, 60]);
  assert.deepEqual(measuredLine(r), [
    [-28, 19, 0],
    [-28, 19, 120],
  ]);
});

test('seen from above, the length is drawn beside the profile instead', () => {
  assert.deepEqual(measuredLine(draw([profile('rail')], 'rail', 'top')), [
    [-21, 10, 0],
    [-21, 10, 120],
  ]);
});

test('seen from the side, an upright shows its length in front of it', () => {
  const upright = profile('upright', { axis: 'y', heightAxis: 'x', lengthMm: 500 });
  // The upright is x −320…−240, y 100…600, z −20…20 mm.
  assert.deepEqual(measuredLine(draw([upright], 'upright', 'side')), [
    [-28, 10, 7],
    [-28, 60, 7],
  ]);
});

test('a span shows the length it takes from the part it reaches, not its last one', () => {
  const across = profile('across', {
    sectionId: '40x40',
    axis: 'x',
    lengthMm: 100,
    placement: {
      kind: 'span',
      parentId: 'rail',
      face: '+x',
      alongMm: 600,
      fromEnd: 'start',
      reachesId: 'far',
    },
  });
  // The far rail's right side (−X) is at x 280 mm, and the rail's left side (+X) at x −260 mm.
  const far = profile('far', { placement: { kind: 'anchor', startMm: { x: 300, y: 100, z: 0 } } });
  const r = draw([profile('rail'), far, across], 'across');
  assert.equal(r.labels[0].text, '540 mm');
});

test('nothing is measured without a selected profile', () => {
  assert.equal(draw([profile('rail')], null).primitives.length, 0);
  assert.equal(draw([profile('rail'), foot], 'foot').primitives.length, 0);
  assert.equal(draw([profile('rail')], 'gone').primitives.length, 0);
});

test('a tilted profile is measured in its frame, turned about the origin', () => {
  const tilted = profile('deck', {
    sectionId: '40x40',
    lengthMm: 400,
    placement: { kind: 'anchor', startMm: { x: 0, y: 0, z: 0 }, tiltDeg: 90 },
  });
  // At 90° the frame's +Z points up and its +Y backwards.
  const r = draw([tilted], 'deck');
  assert.deepEqual(measuredLine(r), [
    [0, 0, -7],
    [0, 40, -7],
  ]);
  assert.deepEqual(rounded(Object.values(r.labels[0].position)), [0, 20, -12]);
});

/** A 40 × 40 profile up out of the rail's top, its center 300 mm from the rail's start. */
const post = profile('post', {
  sectionId: '40x40',
  axis: 'y',
  heightAxis: 'z',
  lengthMm: 300,
  placement: { kind: 'attachment', parentId: 'rail', face: '+y', alongMm: 300, fromEnd: 'start' },
});
const placed = (parts, partId, view = 'iso') => {
  const r = createRenderList();
  drawPlacementAlong(r, ROOT, resolveAssembly(parts), partId, view);
  return r;
};
const lines = (r) =>
  r.primitives
    .filter((p) => p.kind === 'line')
    .map((p) => p.points.map(rounded))
    .filter(([a, b]) => a[0] === b[0] && a[1] === b[1]);

test('a part on a profile is measured from each end of the profile to its center', () => {
  const r = placed([profile('rail'), post], 'post');
  assert.deepEqual(
    r.labels.map(({ text, measures }) => [text, measures]),
    [
      ['300 mm', 'placement-start'],
      ['900 mm', 'placement-end'],
    ],
  );
  // Above the rail in 3D, from its start to the post's center and on to its end.
  assert.deepEqual(lines(r), [
    [
      [-28, 19, 0],
      [-28, 19, 30],
    ],
    [
      [-28, 19, 30],
      [-28, 19, 120],
    ],
  ]);
});

test('seen from above, where a part is on its profile is measured beside the profile', () => {
  const [first] = lines(placed([profile('rail'), post], 'post', 'top'));
  assert.deepEqual(first, [
    [-21, 10, 0],
    [-21, 10, 30],
  ]);
});

test('an anchored part, or none, is not measured along a parent', () => {
  assert.equal(placed([profile('rail')], 'rail').primitives.length, 0);
  assert.equal(placed([profile('rail')], null).primitives.length, 0);
});
