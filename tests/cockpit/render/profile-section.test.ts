import test from 'node:test';
import assert from 'node:assert/strict';
import { profileSectionOutline } from '../../../src/cockpit/render/profile-section.ts';
import {
  MOTEDIS_SERIES_40_SLOT_8,
  profileSection,
} from '../../../src/cockpit/cad/parts/catalog.ts';

type Point = readonly [number, number];

const outlineOf = (sectionId: string) =>
  profileSectionOutline(
    MOTEDIS_SERIES_40_SLOT_8,
    profileSection(MOTEDIS_SERIES_40_SLOT_8, sectionId),
  );

/** Whether a point lies inside a closed polygon, by counting the edges a ray to +u crosses. */
function inside(polygon: readonly Point[], [u, v]: Point): boolean {
  let crossings = 0;
  polygon.forEach(([u1, v1], index) => {
    const [u2, v2] = polygon[(index + 1) % polygon.length];
    if (v1 > v !== v2 > v && u < u1 + ((v - v1) * (u2 - u1)) / (v2 - v1)) crossings++;
  });
  return crossings % 2 === 1;
}

/** Whether two segments cross each other, not counting a shared end. */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const side = (p: Point, q: Point, r: Point) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
}

test('a 40 × 40 section is a 40 mm square, centered on the profile', () => {
  const { outer } = outlineOf('40x40');
  const us = outer.map(([u]) => u);
  const vs = outer.map(([, v]) => v);
  assert.deepEqual([Math.min(...us), Math.max(...us)], [-20, 20]);
  assert.deepEqual([Math.min(...vs), Math.max(...vs)], [-20, 20]);
  assert.ok(inside(outer, [15, 15]), 'the corner is solid');
});

test('each face has a T slot in the middle of each module, its opening as wide as the system’s', () => {
  const { outer } = outlineOf('40x40');
  // Just inside each face, the opening is hollow within half the slot width and solid beyond it.
  for (const [inward, along] of [
    [
      [0, 19],
      [1, 0],
    ],
    [
      [0, -19],
      [1, 0],
    ],
    [
      [19, 0],
      [0, 1],
    ],
    [
      [-19, 0],
      [0, 1],
    ],
  ] as const) {
    const at = (offsetMm: number): Point => [
      inward[0] + along[0] * offsetMm,
      inward[1] + along[1] * offsetMm,
    ];
    assert.equal(inside(outer, at(0)), false, `the opening at ${inward}`);
    assert.equal(inside(outer, at(3.9)), false);
    assert.equal(inside(outer, at(4.1)), true, 'the lip beside the opening');
  }
  // Behind the lips the slot widens for the head of a T-nut.
  assert.equal(inside(outer, [6, 14]), false);
});

test('a 40 × 80 has two slots on each long face and a bore in the middle of each module', () => {
  const { outer, holes } = outlineOf('40x80');
  assert.equal(inside(outer, [19, -20]), false, 'a slot at each module');
  assert.equal(inside(outer, [19, 20]), false);
  assert.equal(inside(outer, [19, 0]), true, 'solid between them');
  assert.equal(holes.length, 2);
  assert.ok(inside(holes[0], [0, -20]));
  assert.ok(inside(holes[1], [0, 20]));
});

test('the outline never crosses itself, so it can be extruded', () => {
  for (const sectionId of ['40x40', '40x80', '40x120']) {
    const { outer } = outlineOf(sectionId);
    const edges = outer.map((point, index) => [point, outer[(index + 1) % outer.length]] as const);
    edges.forEach(([a, b], i) =>
      edges.forEach(([c, d], j) => {
        if (j > i + 1 && !(i === 0 && j === edges.length - 1))
          assert.equal(crosses(a, b, c, d), false, `${sectionId}: edges ${i} and ${j}`);
      }),
    );
  }
});
