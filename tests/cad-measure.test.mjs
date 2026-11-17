import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAssembly } from '../src/cad/assembly.ts';
import { measureBetween, nextMeasurePicks } from '../src/cad/measure.ts';

/** A 40 × 40 rail from front to back, 500 mm long, standing on the floor, centered on `x`. */
const rail = (id, x, { z = 0, tiltDeg } = {}) => ({
  kind: 'profile',
  id,
  name: id,
  systemId: 'motedis-40-i-slot-8',
  sectionId: '40x40',
  axis: 'z',
  heightAxis: 'y',
  lengthMm: 500,
  placement: {
    kind: 'anchor',
    startMm: { x, y: 20, z },
    ...(tiltDeg === undefined ? {} : { tiltDeg }),
  },
});
const pick = (partId, face, x, y, z) => ({ partId, face, pointMm: { x, y, z } });
const rounded = (point) =>
  Object.fromEntries(Object.entries(point).map(([axis, mm]) => [axis, Math.round(mm * 1e6) / 1e6]));

// A is x −20…20 and B x 280…320, both y 0…40 and z 0…500 mm.
const AB = resolveAssembly([rail('a', 0), rail('b', 300)]);

test('two faces that face each other measure the gap between them', () => {
  const measurement = measureBetween(
    AB,
    pick('a', '+x', 20, 20, 100),
    pick('b', '-x', 280, 30, 400),
  );
  assert.equal(measurement.kind, 'gap');
  assert.equal(measurement.gapMm, 260);
  // Straight across, from where the first face was clicked.
  assert.deepEqual(measurement.fromMm, { x: 20, y: 20, z: 100 });
  assert.deepEqual(measurement.toMm, { x: 280, y: 20, z: 100 });
});

test('the gap is drawn where the faces overlap, even if the first click was beside it', () => {
  const resolved = resolveAssembly([rail('a', 0), rail('b', 300, { z: 300 })]);
  const measurement = measureBetween(
    resolved,
    pick('a', '+x', 20, 20, 100),
    pick('b', '-x', 280, 20, 600),
  );
  assert.equal(measurement.gapMm, 260);
  assert.deepEqual(measurement.fromMm, { x: 20, y: 20, z: 300 });
});

test('other pairs of points measure the X, Y and Z offsets between them', () => {
  const measurement = measureBetween(
    AB,
    pick('a', '+y', 5, 40, 100),
    pick('b', '+y', 300, 40, 450),
  );
  assert.equal(measurement.kind, 'offsets');
  assert.deepEqual(measurement.offsetMm, { x: 295, y: 0, z: 350 });
  assert.deepEqual(measurement.fromMm, { x: 5, y: 40, z: 100 });
  assert.deepEqual(measurement.toMm, { x: 300, y: 40, z: 450 });
});

test('faces that look away from each other are not a gap', () => {
  const measurement = measureBetween(
    AB,
    pick('a', '-x', -20, 20, 100),
    pick('b', '+x', 320, 20, 100),
  );
  assert.equal(measurement.kind, 'offsets');
  assert.deepEqual(measurement.offsetMm, { x: 340, y: 0, z: 0 });
});

test('faces that do not overlap across do not face each other', () => {
  const resolved = resolveAssembly([rail('a', 0), rail('b', 300, { z: 1000 })]);
  const measurement = measureBetween(
    resolved,
    pick('a', '+x', 20, 20, 100),
    pick('b', '-x', 280, 20, 1200),
  );
  assert.equal(measurement.kind, 'offsets');
  assert.deepEqual(measurement.offsetMm, { x: 260, y: 0, z: 1100 });
});

test('touching faces have no gap', () => {
  const resolved = resolveAssembly([rail('a', 0), rail('b', 40)]);
  const measurement = measureBetween(
    resolved,
    pick('a', '+x', 20, 20, 100),
    pick('b', '-x', 20, 20, 100),
  );
  assert.equal(measurement.kind, 'gap');
  assert.equal(measurement.gapMm, 0);
});

test('points on a tilted part are measured in cockpit coordinates', () => {
  // At 90° the frame's +Z points up and its +Y backwards.
  const resolved = resolveAssembly([rail('a', 0), rail('deck', 300, { tiltDeg: 90 })]);
  const measurement = measureBetween(
    resolved,
    pick('a', '+y', 0, 40, 0),
    pick('deck', '+y', 300, 40, 400),
  );
  assert.equal(measurement.kind, 'offsets');
  assert.deepEqual(rounded(measurement.toMm), { x: 300, y: 400, z: -40 });
  assert.deepEqual(rounded(measurement.offsetMm), { x: 300, y: 360, z: -40 });
});

test('parts at different tilts have no facing faces', () => {
  const resolved = resolveAssembly([rail('a', 0), rail('b', 300, { tiltDeg: 10 })]);
  const measurement = measureBetween(
    resolved,
    pick('a', '+x', 20, 20, 100),
    pick('b', '-x', 280, 20, 100),
  );
  assert.equal(measurement.kind, 'offsets');
});

test('a measurement takes two clicks on parts, and a third one starts again', () => {
  const first = pick('a', '+x', 20, 20, 100);
  const second = pick('b', '-x', 280, 20, 100);
  const third = pick('b', '+y', 300, 40, 0);
  assert.deepEqual(nextMeasurePicks([], first), [first]);
  assert.deepEqual(nextMeasurePicks([first], second), [first, second]);
  assert.deepEqual(nextMeasurePicks([first, second], third), [third]);
});

test('a click beside every part leaves the measurement as it was', () => {
  const first = pick('a', '+x', 20, 20, 100);
  assert.deepEqual(nextMeasurePicks([first], null), [first]);
  assert.deepEqual(nextMeasurePicks([], null), []);
});
