import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  editProfile,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import { peripheralHoleProblems } from '../../../../src/cockpit/cad/analysis/peripheral-holes.ts';
import { plateHistory, railHistory, withPeripheral } from '../../../support/designs.ts';

/**
 * Two 40 × 40 rails along Z, Left rail at X 0 and Right rail `gapMm` towards −X, the driver's
 * right, as a seat stands on: part-1 and part-2.
 */
function twoRails(gapMm: number): Operation[] {
  let history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'Left rail',
    lengthMm: 800,
    startMm: { x: 0, y: 20, z: 0 },
  });
  history = addAnchoredProfile(history).history;
  return editProfile(history, 'part-2', {
    name: 'Right rail',
    lengthMm: 800,
    startMm: { x: -gapMm, y: 20, z: 0 },
  });
}

/** The generic seat on Left rail, its left holes over its slot: part-3. */
const seatOn = (history: readonly Operation[]) =>
  withPeripheral(history, 'part-1', 'generic-seat', { alongMm: 400, holesOver: 'left' });

const problemsOf = (history: readonly Operation[]) =>
  peripheralHoleProblems(replayDesign(history).resolved).map((problem) => problem.text);

test('a seat on two rails as far apart as its holes has each hole in a slot', () => {
  assert.deepEqual(problemsOf(seatOn(twoRails(360))), []);
});

test('a hole beside the slot of the profile under it is off by how far it is', () => {
  // The seat's holes 1 and 2 are on its right, 180 mm towards −X.
  assert.deepEqual(problemsOf(seatOn(twoRails(340))), [
    'Bucket seat, hole 1 is 20 mm off the slot of Right rail',
    'Bucket seat, hole 2 is 20 mm off the slot of Right rail',
  ]);
});

test('a hole over no profile has nothing to bolt into', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.deepEqual(problemsOf(history), [
    'Pedal set, hole 1 is over no profile to bolt into',
    'Pedal set, hole 2 is over no profile to bolt into',
    'Pedal set, hole 3 is over no profile to bolt into',
    'Pedal set, hole 4 is over no profile to bolt into',
  ]);
  assert.deepEqual(
    peripheralHoleProblems(replayDesign(history).resolved).map((problem) => problem.holeIndex),
    [0, 1, 2, 3],
  );
});

test('a peripheral on a plate is bolted through holes the plate is made with, not into a slot', () => {
  assert.deepEqual(problemsOf(withPeripheral(plateHistory(), 'part-2', 'generic-pedals')), []);
});
