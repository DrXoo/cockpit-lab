import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderList, ROOT } from '../../../src/scene/render-list.ts';
import { drawDriver } from '../../../src/cockpit/render/driver.ts';
import type { DriverFigure } from '../../../src/cockpit/cad/driver/driver.ts';

const figure: DriverFigure = {
  hip: { x: 0, y: 300, z: 0 },
  knee: { x: 0, y: 450, z: 400 },
  heel: { x: 0, y: 100, z: 800 },
  shoulder: { x: 0, y: 800, z: -100 },
  eye: { x: 0, y: 980, z: -120 },
  elbow: { x: 0, y: 600, z: 150 },
  hands: { x: 0, y: 650, z: 450 },
};
const drawn = (driverFigure: DriverFigure) => {
  const r = createRenderList();
  drawDriver(r, ROOT, driverFigure);
  return r.primitives.filter((primitive) => primitive.kind !== 'material');
};

test('the driver is a figure of limbs from joint to joint, in cm', () => {
  const tubes = drawn(figure)
    .filter((primitive) => primitive.kind === 'tube')
    .map(({ from, to }) => [from, to]);
  assert.deepEqual(tubes, [
    [
      [0, 30, 0],
      [0, 45, 40],
    ],
    [
      [0, 45, 40],
      [0, 10, 80],
    ],
    [
      [0, 30, 0],
      [0, 80, -10],
    ],
    [
      [0, 80, -10],
      [0, 98, -12],
    ],
    [
      [0, 80, -10],
      [0, 60, 15],
    ],
    [
      [0, 60, 15],
      [0, 65, 45],
    ],
  ]);
});

test('the eye point is marked with a ball', () => {
  const balls = drawn(figure).filter((primitive) => primitive.kind === 'sphere');
  assert.deepEqual(
    balls.map(({ position }) => position),
    [[0, 98, -12]],
  );
});

test('without hands to hold, the figure has no arms', () => {
  const tubes = drawn({ ...figure, elbow: null, hands: null }).filter(
    (primitive) => primitive.kind === 'tube',
  );
  assert.equal(tubes.length, 4);
});

test('the figure is drawn over the parts, so the seat it sits in does not hide it', () => {
  const r = createRenderList();
  drawDriver(r, ROOT, figure);
  const materials = r.primitives.filter((primitive) => primitive.kind === 'material');
  assert.ok(materials.length > 0);
  assert.ok(materials.every(({ spec }) => spec.kind === 'flat' && spec.onTop === true));
});
