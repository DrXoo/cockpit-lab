import test from 'node:test';
import assert from 'node:assert/strict';
import { adjustmentOf, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import {
  addAdjustment,
  editAdjustment,
  removeAdjustment,
} from '../../../../src/cockpit/cad/history/adjustments.ts';
import { addMode, type Mode } from '../../../../src/cockpit/cad/history/modes.ts';
import {
  addFittedMode,
  checkedModePositions,
  deleteFittedMode,
  historyInMode,
  keepFitting,
} from '../../../../src/cockpit/cad/history/mode-positions.ts';
import { deckHistory } from '../../../support/designs.ts';
import { present } from '../../../support/lookups.ts';

const WHEEL_BASE_ID = 'part-4';

/** The deck history with the wheel base (part-4) on a 100 mm travel, `positionMm` along it. */
function adjustedDeck(positionMm = 0): Operation[] {
  const adjusted = addAdjustment(deckHistory(), WHEEL_BASE_ID);
  return editAdjustment(adjusted, WHEEL_BASE_ID, { positionMm });
}

const positionIn = (history: readonly Operation[], partId = WHEEL_BASE_ID): number => {
  const operation = history.find((step) => 'partId' in step && step.partId === partId);
  return present(operation && adjustmentOf(operation), `the adjustment of ${partId}`).positionMm;
};

/** Two modes, the second with the wheel base at `positionMm`. */
const twoModes = (positionMm: number): Mode[] => [
  { id: 'mode-1', name: 'Racing', takenOff: [] },
  { id: 'mode-2', name: 'Flight', takenOff: [], positionsMm: { [WHEEL_BASE_ID]: positionMm } },
];

test('the first mode fits the parts where the operations put them', () => {
  const history = adjustedDeck(20);

  assert.deepEqual(historyInMode(history, twoModes(-30), 'mode-1'), history);
  assert.deepEqual(historyInMode(history, twoModes(-30), null), history);
  assert.deepEqual(historyInMode(history, [], null), history);
});

test('a later mode puts each adjustment at its own position', () => {
  const fitted = historyInMode(adjustedDeck(20), twoModes(-30), 'mode-2');

  assert.equal(positionIn(fitted), -30);
});

test('the first mode takes the positions of the operations, and keeps none of its own', () => {
  const modes = addFittedMode(adjustedDeck(20), [], null);

  assert.deepEqual(modes, [{ id: 'mode-1', name: 'Mode 1', takenOff: [] }]);
});

test('a new mode starts with the positions of the mode shown', () => {
  const history = adjustedDeck(20);

  const fromSecond = addFittedMode(history, twoModes(-30), 'mode-2');
  const fromAllParts = addFittedMode(history, twoModes(-30), null);

  assert.deepEqual(fromSecond.at(-1)?.positionsMm, { [WHEEL_BASE_ID]: -30 });
  assert.deepEqual(fromAllParts.at(-1)?.positionsMm, { [WHEEL_BASE_ID]: 20 });
});

test('fitting in a later mode moves its parts and leaves the operations where they were', () => {
  const stored = adjustedDeck(20);
  const fitted = historyInMode(stored, twoModes(-30), 'mode-2');
  const moved = editAdjustment(fitted, WHEEL_BASE_ID, { positionMm: 40 });

  const kept = keepFitting(moved, stored, twoModes(-30), 'mode-2');

  assert.equal(positionIn(kept.history), 20);
  assert.deepEqual(kept.modes[1]?.positionsMm, { [WHEEL_BASE_ID]: 40 });
});

test('fitting in the first mode moves the operations and leaves the other modes alone', () => {
  const stored = adjustedDeck(20);
  const moved = editAdjustment(stored, WHEEL_BASE_ID, { positionMm: 40 });

  const kept = keepFitting(moved, stored, twoModes(-30), 'mode-1');

  assert.equal(positionIn(kept.history), 40);
  assert.deepEqual(kept.modes, twoModes(-30));
});

test('a new adjustment starts at the same position in every mode', () => {
  const stored = deckHistory();
  const modes = addMode(addMode([]));
  const added = addAdjustment(stored, WHEEL_BASE_ID);

  const kept = keepFitting(added, stored, modes, 'mode-1');

  assert.deepEqual(kept.modes[1]?.positionsMm, { [WHEEL_BASE_ID]: 0 });
});

test('a part changed in a later mode keeps the position of the operations', () => {
  const stored = adjustedDeck(20);
  const fitted = historyInMode(stored, twoModes(-30), 'mode-2');
  const shorter = editAdjustment(fitted, WHEEL_BASE_ID, { travelMm: 80 });

  const kept = keepFitting(shorter, stored, twoModes(-30), 'mode-2');

  assert.equal(positionIn(kept.history), 20);
  assert.deepEqual(kept.modes[1]?.positionsMm, { [WHEEL_BASE_ID]: -30 });
});

test('a shorter travel brings every mode within it', () => {
  const stored = adjustedDeck(40);
  const shorter = editAdjustment(stored, WHEEL_BASE_ID, { travelMm: 40 });

  const kept = keepFitting(shorter, stored, twoModes(-45), 'mode-1');

  assert.equal(positionIn(kept.history), 20);
  assert.deepEqual(kept.modes[1]?.positionsMm, { [WHEEL_BASE_ID]: -20 });
});

test('an adjustment removed leaves every mode', () => {
  const stored = adjustedDeck(20);
  const fitted = historyInMode(stored, twoModes(-30), 'mode-2');

  const kept = keepFitting(
    removeAdjustment(fitted, WHEEL_BASE_ID),
    stored,
    twoModes(-30),
    'mode-2',
  );

  assert.equal(kept.modes[1]?.positionsMm, undefined);
});

test('deleting the first mode puts the positions of the next into the operations', () => {
  const deleted = deleteFittedMode(adjustedDeck(20), twoModes(-30), 'mode-1');

  assert.equal(positionIn(deleted.history), -30);
  assert.deepEqual(deleted.modes, [{ id: 'mode-2', name: 'Flight', takenOff: [] }]);
});

test('deleting a later mode leaves the operations alone', () => {
  const history = adjustedDeck(20);

  const deleted = deleteFittedMode(history, twoModes(-30), 'mode-2');

  assert.deepEqual(deleted.history, history);
  assert.deepEqual(deleted.modes, [twoModes(-30)[0]]);
});

test('a mode stored without positions takes those of the operations', () => {
  const modes = addMode(addMode([]));

  const checked = checkedModePositions(adjustedDeck(20), modes);

  assert.deepEqual(checked[1]?.positionsMm, { [WHEEL_BASE_ID]: 20 });
});

test('stored positions the design cannot have are refused', () => {
  const history = adjustedDeck(20);
  const first: Mode = { id: 'mode-1', name: 'Racing', takenOff: [], positionsMm: { part: 0 } };
  const withPart = (partId: string, positionMm: number): Mode[] => [
    { id: 'mode-1', name: 'Racing', takenOff: [] },
    { id: 'mode-2', name: 'Flight', takenOff: [], positionsMm: { [partId]: positionMm } },
  ];

  assert.throws(() => checkedModePositions(history, [first]), /first mode/);
  assert.throws(() => checkedModePositions(history, withPart('part-3', 0)), /no adjustment/);
  assert.throws(() => checkedModePositions(history, withPart(WHEEL_BASE_ID, 60)), /travel/);
});
