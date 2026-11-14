import test from 'node:test';
import assert from 'node:assert/strict';
import { plateHoles } from '../src/cad/plate.ts';

// Reference case from docs/mini-cad.md: a test case, not a manufacturer's pattern.
const referencePattern = {
  holes: [
    { xMm: -60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: 40, diameterMm: 6.5 },
    { xMm: -60, yMm: 40, diameterMm: 6.5 },
  ],
};
const referencePlate = { widthMm: 200, depthMm: 150, thicknessMm: 5, ownHoles: [] };

test('a peripheral mounted at the center of the reference plate puts its pattern there', () => {
  const holes = plateHoles(referencePlate, [
    { pattern: referencePattern, originXMm: 0, originYMm: 0 },
  ]);
  assert.deepEqual(holes, referencePattern.holes);
});

test('the holes follow the peripheral where it is mounted, and keep their diameter', () => {
  const holes = plateHoles(referencePlate, [
    { pattern: referencePattern, originXMm: 15, originYMm: -10 },
  ]);
  assert.deepEqual(holes, [
    { xMm: -45, yMm: -50, diameterMm: 6.5 },
    { xMm: 75, yMm: -50, diameterMm: 6.5 },
    { xMm: 75, yMm: 30, diameterMm: 6.5 },
    { xMm: -45, yMm: 30, diameterMm: 6.5 },
  ]);
});

test('the plate keeps its own holes beside those of mounted peripherals', () => {
  const ownHole = { xMm: 90, yMm: 0, diameterMm: 8.5 };
  const holes = plateHoles({ ...referencePlate, ownHoles: [ownHole] }, [
    { pattern: referencePattern, originXMm: 0, originYMm: 0 },
  ]);
  assert.deepEqual(holes, [ownHole, ...referencePattern.holes]);
});
