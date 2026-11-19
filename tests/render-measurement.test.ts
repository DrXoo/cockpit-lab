import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT, type RenderList } from '../src/render-list.ts';
import type { Vec3Mm } from '../src/cad/assembly.ts';
import type { Measurement } from '../src/cad/measure.ts';
import { ofKind } from './support/lookups.ts';
import { drawMeasurement } from '../src/render-measurement.ts';

const rounded = (point: readonly number[]) => point.map((value) => Math.round(value * 1000) / 1000);
/** The measured line: the first line drawn. */
const measuredLine = (r: RenderList) =>
  ofKind(
    r.primitives.find((p) => p.kind === 'line'),
    'line',
  ).points.map(rounded);

const drawMeasure = (points: Vec3Mm[], measurement: Measurement | null = null) => {
  const r = createRenderList();
  drawMeasurement(r, ROOT, { points, measurement });
  return r;
};
const markers = (r: RenderList) => r.primitives.filter((p) => p.kind === 'sphere');

test('each clicked point of a measurement is marked, in cockpit cm', () => {
  const r = drawMeasure([{ x: 20, y: 20, z: 100 }]);
  assert.deepEqual(
    markers(r).map((marker) => marker.position),
    [[2, 2, 10]],
  );
  assert.equal(r.labels.length, 0);
});

test('a gap is drawn straight across, with its width', () => {
  const r = drawMeasure(
    [
      { x: 20, y: 20, z: 100 },
      { x: 280, y: 30, z: 400 },
    ],
    {
      kind: 'gap',
      gapMm: 260,
      fromMm: { x: 20, y: 20, z: 100 },
      toMm: { x: 280, y: 20, z: 100 },
    },
  );
  assert.equal(markers(r).length, 2);
  assert.deepEqual(measuredLine(r), [
    [2, 2, 10],
    [28, 2, 10],
  ]);
  assert.deepEqual(
    r.labels.map((label) => [label.text, label.measures, label.alwaysShown]),
    [['260 mm', 'gap', true]],
  );
});

test('offsets are drawn as one leg per axis, X then Y then Z, leaving out those with none', () => {
  const r = drawMeasure(
    [
      { x: 5, y: 40, z: 100 },
      { x: 300, y: 40, z: 450 },
    ],
    {
      kind: 'offsets',
      offsetMm: { x: 295, y: 0, z: 350 },
      fromMm: { x: 5, y: 40, z: 100 },
      toMm: { x: 300, y: 40, z: 450 },
    },
  );
  assert.deepEqual(
    r.labels.map((label) => [label.text, label.measures]),
    [
      ['X 295 mm', 'offset-x'],
      ['Z 350 mm', 'offset-z'],
    ],
  );
  const legs = r.primitives
    .filter((p) => p.kind === 'line')
    .filter((line) => line.points.length === 2)
    .map((line) => line.points.map(rounded))
    .filter(([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) > 10);
  assert.deepEqual(legs, [
    [
      [0.5, 4, 10],
      [30, 4, 10],
    ],
    [
      [30, 4, 10],
      [30, 4, 45],
    ],
  ]);
});
