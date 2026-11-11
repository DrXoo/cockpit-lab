import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  round,
  transformPoint,
  inversePoint,
  rectangle,
  overlapDepth,
  polygonDistance,
} from '../src/geometry.ts';

const near = (actual, expected, tolerance = 1e-9) =>
  assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≉ ${expected}`);
const nearPoint = (actual, expected) => {
  near(actual.x, expected.x);
  near(actual.y, expected.y);
  near(actual.z, expected.z);
};
const square = (x0, x1, z0, z1) => rectangle(x0, x1, z0, z1, { x: 0, z: 0, angle: 0 });

test('clamp limits a value to a range and round keeps the given decimals', () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
  assert.equal(round(1.26), 1.3);
  assert.equal(round(1.2345, 3), 1.235);
});

test('transformPoint rotates about +Y and then translates in the floor plane', () => {
  const placement = { x: 10, z: 20, angle: 90 };
  nearPoint(transformPoint({ x: 1, z: 0 }, placement), { x: 10, y: 0, z: 19 });
  nearPoint(transformPoint({ x: 0, y: 5, z: 1 }, placement), { x: 11, y: 5, z: 20 });
});

test('inversePoint undoes transformPoint', () => {
  const placement = { x: -12, z: 7, angle: 33 };
  const point = { x: 4, y: 2, z: -9 };
  nearPoint(inversePoint(transformPoint(point, placement), placement), point);
});

test('rectangle returns the four transformed corners in order', () => {
  const corners = rectangle(0, 2, 0, 1, { x: 5, z: 5, angle: 0 });
  assert.deepEqual(
    corners.map(({ x, z }) => [x, z]),
    [
      [5, 5],
      [7, 5],
      [7, 6],
      [5, 6],
    ],
  );
});

test('overlapDepth is the minimum penetration, and zero when polygons only touch', () => {
  near(overlapDepth(square(0, 10, 0, 10), square(8, 20, 0, 10)), 2);
  assert.equal(overlapDepth(square(0, 10, 0, 10), square(10, 20, 0, 10)), 0);
  assert.equal(overlapDepth(square(0, 10, 0, 10), square(15, 20, 0, 10)), 0);
});

test('polygonDistance is the gap between polygons, negative when they overlap', () => {
  near(polygonDistance(square(0, 10, 0, 10), square(15, 20, 0, 10)), 5);
  near(polygonDistance(square(0, 10, 0, 10), square(13, 20, 14, 20)), 5);
  near(polygonDistance(square(0, 10, 0, 10), square(8, 20, 0, 10)), -2);
});
