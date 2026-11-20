import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';
import { fastenWithBolts } from '../../../../src/cockpit/cad/history/fastening.ts';
import { editPlate } from '../../../../src/cockpit/cad/history/plates.ts';
import { plateHoleProblems } from '../../../../src/cockpit/cad/analysis/hole-problems.ts';
import type { Hole } from '../../../../src/cockpit/cad/parts/mounting-pattern.ts';
import { railHistory, withPeripheral, withPlate } from '../../../support/designs.ts';

/**
 * The reference plate of docs/mini-cad.md, 200 × 150 × 8 mm and laser cut, on the middle of the
 * rail's top (part-2). Seen from above, the rail runs up the page under x = −20 to 20 mm, its
 * one slot on x = 0.
 */
function referencePlate(changes: Parameters<typeof withPlate>[2] = {}): Operation[] {
  return withPlate(railHistory(), 'part-1', {
    name: 'Reference plate',
    widthMm: 200,
    depthMm: 150,
    ...changes,
  });
}

/** A wheel base (part-3) at the plate's center, with these holes, its X to the plate's left. */
const withHoles = (history: readonly Operation[], holes: Hole[]) =>
  withPeripheral(history, 'part-2', 'generic-wheel-base', { mountingPattern: { holes } });

const hole = (xMm: number, diameterMm = 8): Hole => ({ xMm, yMm: 0, diameterMm });

const problemsOf = (history: readonly Operation[]) =>
  plateHoleProblems(replayDesign(history), 'part-2').map(({ kind, holeIndexes, text }) => ({
    kind,
    holeIndexes,
    text,
  }));

test('a plate whose holes keep clear of everything has no problems', () => {
  const history = fastenWithBolts(
    withHoles(referencePlate(), [hole(0), hole(-60)]),
    'part-2@part-1',
    2,
  );
  assert.deepEqual(problemsOf(history), []);
});

test('a hole that crosses the outline, or lies off it, is reported', () => {
  const history = withHoles(referencePlate(), [hole(97), hole(130)]);
  assert.deepEqual(problemsOf(history), [
    { kind: 'off-plate', holeIndexes: [0], text: 'Wheel base and wheel, hole 1 crosses the edge' },
    {
      kind: 'off-plate',
      holeIndexes: [1],
      text: 'Wheel base and wheel, hole 2 lies off the plate',
    },
  ]);
});

test('a hole too close to the edge for the process is reported with its distance', () => {
  // 6 mm of material to the edge: less than a laser wants in 8 mm sheet, enough in 5 mm.
  const laserCut = withHoles(referencePlate(), [hole(90)]);
  assert.deepEqual(problemsOf(laserCut), [
    {
      kind: 'near-edge',
      holeIndexes: [0],
      text: 'Wheel base and wheel, hole 1 is 6 mm from the edge; laser or water-jet cutting wants 8 mm',
    },
  ]);
  const thinner = withHoles(referencePlate({ sheetId: 'aluminium-5' }), [hole(90)]);
  assert.deepEqual(problemsOf(thinner), []);
  // Drilled by hand, an 8 mm hole wants its center 12 mm from the edge.
  const drilled = editPlate(thinner, 'part-2', { processId: 'hand-drilling' });
  assert.deepEqual(
    problemsOf(drilled).map(({ text }) => text),
    ['Wheel base and wheel, hole 1 is 6 mm from the edge; drilling by hand wants 8 mm'],
  );
});

test('holes that overlap, or come too close for the process, are reported with the distance', () => {
  const close = withHoles(referencePlate(), [hole(40), hole(50)]);
  assert.deepEqual(problemsOf(close), [
    {
      kind: 'near-hole',
      holeIndexes: [0, 1],
      text: 'Wheel base and wheel, hole 1 and Wheel base and wheel, hole 2 are 2 mm apart; laser or water-jet cutting wants 8 mm',
    },
  ]);
  const overlapping = withHoles(referencePlate(), [hole(40), hole(45)]);
  assert.deepEqual(
    problemsOf(overlapping).map(({ text }) => text),
    ['Wheel base and wheel, hole 1 and Wheel base and wheel, hole 2 overlap by 3 mm'],
  );
});

test('a slot is measured along its length, against the edge and other holes', () => {
  let history = withHoles(referencePlate(), [hole(0), hole(-40)]);
  history = addAdjustment(history, 'part-3');
  // Slots 8 mm wide and 148 mm long, up the page: 1 mm short of either edge.
  history = editAdjustment(history, 'part-3', { travelMm: 140, runsOn: 'slots' });
  assert.deepEqual(
    problemsOf(history).map(({ kind, holeIndexes }) => [kind, holeIndexes]),
    [
      ['near-edge', [0]],
      ['near-edge', [1]],
    ],
  );
});

test('a process that cuts no slots reports each slot', () => {
  let history = withHoles(referencePlate({ processId: 'hand-drilling' }), [hole(0)]);
  history = addAdjustment(history, 'part-3');
  history = editAdjustment(history, 'part-3', { runsOn: 'slots' });
  assert.deepEqual(problemsOf(history), [
    {
      kind: 'uncut-slot',
      holeIndexes: [0],
      text: 'Wheel base and wheel, hole 1 is a slot, which drilling by hand cannot cut',
    },
  ]);
});

test('a mounting hole over the profile is reported unless it is over the profile’s slot', () => {
  const offTheSlot = withHoles(referencePlate(), [hole(10)]);
  assert.deepEqual(problemsOf(offTheSlot), [
    {
      kind: 'over-profile',
      holeIndexes: [0],
      text: 'Wheel base and wheel, hole 1 is over Rail but off its slot: its bolt has no room for a nut',
    },
  ]);
  assert.deepEqual(problemsOf(withHoles(referencePlate(), [hole(0)])), [], 'it takes a T-nut');
});

test('a slot must lie wholly along the profile’s slot or wholly off the profile', () => {
  let history = withHoles(referencePlate(), [hole(0)]);
  history = addAdjustment(history, 'part-3');
  const along = editAdjustment(history, 'part-3', { runsOn: 'slots' });
  assert.deepEqual(problemsOf(along), [], 'it slides along the profile’s slot');
  const across = editAdjustment(along, 'part-3', { axis: 'x' });
  assert.deepEqual(
    problemsOf(across).map(({ kind }) => kind),
    ['over-profile'],
    'it crosses the profile',
  );
});

test('the bolts that fasten the plate sit in the profile’s slot and are never over the profile', () => {
  const history = fastenWithBolts(referencePlate(), 'part-2@part-1', 3);
  assert.deepEqual(problemsOf(history), []);
});
