import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import { fastenWithBolts } from '../../../../src/cockpit/cad/history/fastening.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';
import { holesOfPlate, plateView } from '../../../../src/cockpit/cad/parts/plate-holes.ts';
import { plateBoltType } from '../../../../src/cockpit/cad/parts/catalog.ts';
import { railHistory, withPeripheral, withPlate } from '../../../support/designs.ts';
import { ofKind, present } from '../../../support/lookups.ts';

// Reference case from docs/mini-cad.md: a test case, not a manufacturer's pattern.
const referencePattern = {
  holes: [
    { xMm: -60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: -40, diameterMm: 6.5 },
    { xMm: 60, yMm: 40, diameterMm: 6.5 },
    { xMm: -60, yMm: 40, diameterMm: 6.5 },
  ],
};
const ONE_HOLE = { holes: [{ xMm: 0, yMm: 0, diameterMm: 8 }] };

/** The rail (part-1), 1000 mm along z, with a 200 × 150 plate on the middle of its top (part-2). */
function referencePlate(changes: Parameters<typeof withPlate>[2] = {}): Operation[] {
  return withPlate(railHistory(), 'part-1', {
    name: 'Reference plate',
    widthMm: 200,
    depthMm: 150,
    ...changes,
  });
}

const plateIn = (history: readonly Operation[]) =>
  ofKind(replayDesign(history).resolved.get('part-2')?.part, 'plate');

const holesOf = (history: readonly Operation[], plateId = 'part-2') =>
  holesOfPlate(replayDesign(history), plateId).map(({ xMm, yMm, diameterMm }) => ({
    xMm: Math.round(xMm * 1000) / 1000 || 0,
    yMm: Math.round(yMm * 1000) / 1000 || 0,
    diameterMm,
  }));

test('a plate is drawn from the face away from its profile, its depth up the page', () => {
  // Seen from above with the front up the page, the driver's right (−X) is on the right.
  assert.deepEqual(plateView(plateIn(referencePlate())), {
    right: '-x',
    up: '+z',
    seenFrom: '+y',
  });
});

test('a plate under its profile is seen from below, so its holes are mirrored', () => {
  const below = referencePlate({ face: '-y' });
  assert.deepEqual(plateView(plateIn(below)), { right: '+x', up: '+z', seenFrom: '-y' });
  const offToTheLeft = { mountingPattern: ONE_HOLE, acrossMm: 50 };
  const above = withPeripheral(referencePlate(), 'part-2', 'generic-wheel-base', offToTheLeft);
  const under = withPeripheral(below, 'part-2', 'generic-wheel-base', offToTheLeft);
  assert.deepEqual(holesOf(above), [{ xMm: -50, yMm: 0, diameterMm: 8 }]);
  assert.deepEqual(holesOf(under), [{ xMm: 50, yMm: 0, diameterMm: 8 }]);
});

test('a peripheral at the center of the reference plate puts its pattern there, seen from above', () => {
  const history = withPeripheral(referencePlate(), 'part-2', 'generic-wheel-base', {
    mountingPattern: referencePattern,
  });
  // Its pattern is measured on its underside, X across towards the driver's left (+X): seen
  // from above, that is to the left of the page.
  assert.deepEqual(holesOf(history), [
    { xMm: 60, yMm: -40, diameterMm: 6.5 },
    { xMm: -60, yMm: -40, diameterMm: 6.5 },
    { xMm: -60, yMm: 40, diameterMm: 6.5 },
    { xMm: 60, yMm: 40, diameterMm: 6.5 },
  ]);
});

test('mounting holes follow their peripheral where it is mounted, and are named after it', () => {
  const history = withPeripheral(referencePlate(), 'part-2', 'generic-wheel-base', {
    name: 'Wheel base',
    mountingPattern: ONE_HOLE,
    alongMm: 50,
    acrossMm: -20,
  });
  const [hole] = holesOfPlate(replayDesign(history), 'part-2');
  assert.deepEqual(
    { ...present(hole, 'the hole'), xMm: Math.round(hole.xMm), yMm: Math.round(hole.yMm) },
    { kind: 'mounting', xMm: 20, yMm: -25, diameterMm: 8, source: 'Wheel base, hole 1' },
  );
});

test('holes stay where a peripheral is at the center of its travel', () => {
  let history = withPeripheral(referencePlate(), 'part-2', 'generic-wheel-base', {
    mountingPattern: ONE_HOLE,
  });
  history = addAdjustment(history, 'part-3');
  history = editAdjustment(history, 'part-3', { positionMm: 40 });
  assert.deepEqual(holesOf(history), [{ xMm: 0, yMm: 0, diameterMm: 8 }]);
});

test('each bolt fastening the plate to a profile puts a fastening hole of its clearance diameter', () => {
  let history = referencePlate();
  history = fastenWithBolts(history, 'part-2@part-1', 2);
  const holes = holesOfPlate(replayDesign(history), 'part-2');
  const clearanceMm = plateBoltType('plate-bolt-m8').clearanceHoleMm;
  assert.equal(clearanceMm, 9);
  assert.deepEqual(
    holes.map(({ kind, xMm, yMm, diameterMm, source }) => ({
      kind,
      xMm: Math.round(xMm) || 0,
      yMm,
      diameterMm,
      source,
    })),
    [
      { kind: 'fastening', xMm: 0, yMm: -37.5, diameterMm: 9, source: 'Bolt 1 to Rail' },
      { kind: 'fastening', xMm: 0, yMm: 37.5, diameterMm: 9, source: 'Bolt 2 to Rail' },
    ],
  );
});

test('a plate has no holes until something puts them there', () => {
  assert.deepEqual(holesOfPlate(replayDesign(referencePlate()), 'part-2'), []);
});

test('only a plate has plate holes', () => {
  assert.throws(() => holesOfPlate(replayDesign(referencePlate()), 'part-1'), /not a plate/);
});
