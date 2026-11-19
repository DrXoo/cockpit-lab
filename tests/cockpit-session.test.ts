import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_DRIVER } from '../src/cad/driver.ts';
import {
  addAnchoredProfile,
  draftGrowth,
  editProfile,
  type Operation,
} from '../src/cad/history.ts';
import { fastenWithBrackets } from '../src/cad/fastening.ts';
import { partHandles } from '../src/cad/handles.ts';
import type { PartHit } from '../src/cad/picking.ts';
import type { CockpitDesign } from '../src/cockpit-design.ts';
import {
  cancelChange,
  changeDesign,
  changeInView,
  confirmChange,
  confirmDraft,
  deleteSelectedStep,
  designHistory,
  historyChange,
  jointChange,
  markerIndex,
  measureAt,
  moveMarker,
  newSession,
  redoEdit,
  removeSelectedPart,
  reopened,
  selectedOperation,
  selectedPartId,
  selectStep,
  setFitting,
  setMeasuring,
  shownHandles,
  shownJointMarkers,
  startDraft,
  undoEdit,
  withAddedPart,
  withHistory,
  type CockpitSession,
  type HistoryChange,
} from '../src/cockpit-session.ts';
import { railHistory, withGrowth, withPeripheral, withPlate } from './support/designs.ts';
import { present } from './support/lookups.ts';

const designOf = (history: readonly Operation[]): CockpitDesign => ({
  history,
  driver: DEFAULT_DRIVER,
});

/** The rail, an upright grown out of it (part-2) and a plate on the rail (part-3). */
function threeSteps(): Operation[] {
  return withPlate(withGrowth(railHistory(), 'part-1'), 'part-1');
}

const sessionOf = (history: readonly Operation[]): CockpitSession => newSession(designOf(history));

/** The id of the step that makes `partId`. */
function stepOf(session: CockpitSession, partId: string): string {
  const step = designHistory(session).find(
    (operation) => 'partId' in operation && operation.partId === partId,
  );
  return present(step, `the step making ${partId}`).id;
}

function changedSession(result: HistoryChange): CockpitSession {
  if (result.kind !== 'changed') throw new Error(`Expected the history to change: ${result.kind}`);
  return result.session;
}

const undone = (session: CockpitSession) => present(undoEdit(session), 'an edit to undo');

test('a new session follows the last step, with nothing selected, being added or measured', () => {
  const session = sessionOf(threeSteps());
  assert.equal(markerIndex(session), 3);
  assert.equal(selectedOperation(session), undefined);
  assert.equal(session.draft, null);
  assert.equal(session.measurePicks, null);
  assert.equal(session.fitting, false);
});

test('a session without a design has an empty history', () => {
  const session = newSession(null);
  assert.deepEqual(designHistory(session), []);
  assert.equal(markerIndex(session), 0);
});

test('selecting a step selects the part it makes', () => {
  const session = sessionOf(threeSteps());
  const selected = selectStep(session, stepOf(session, 'part-2'));
  assert.equal(selectedPartId(selected), 'part-2');
});

test('selecting a peripheral turns Fit on, and turning Fit off unselects it', () => {
  const session = sessionOf(withPeripheral(railHistory(), 'part-1', 'generic-seat'));
  const fitting = selectStep(session, stepOf(session, 'part-2'));
  assert.equal(fitting.fitting, true);
  assert.equal(selectedPartId(fitting), 'part-2');
  const designing = setFitting(fitting, false);
  assert.equal(designing.fitting, false);
  assert.equal(selectedOperation(designing), undefined);
});

test('turning Fit off keeps a part of the frame selected', () => {
  const session = setFitting(selectStep(sessionOf(railHistory()), 'op-1'), true);
  assert.equal(selectedPartId(setFitting(session, false)), 'part-1');
});

test('turning Fit on or off drops the part being added', () => {
  const session = selectStep(sessionOf(railHistory()), 'op-1');
  const drafting = startDraft(session, draftGrowth(railHistory(), 'part-1'));
  assert.equal(setFitting(drafting, true).draft, null);
});

test('moving the marker back unselects a step after it, and past the end follows the last', () => {
  const session = selectStep(sessionOf(threeSteps()), 'op-3');
  const back = moveMarker(session, 2);
  assert.equal(markerIndex(back), 2);
  assert.equal(selectedOperation(back), undefined);
  assert.equal(back.marker, 2);
  assert.equal(moveMarker(back, 7).marker, null);
  assert.equal(markerIndex(moveMarker(back, -3)), 0);
});

test('a selected part the marker leaves out is not shown as selected', () => {
  const session = selectStep(sessionOf(threeSteps()), 'op-2');
  assert.equal(selectedPartId(session), 'part-2');
  assert.equal(selectedPartId({ ...session, marker: 1 }), null);
});

test('a part added at a moved marker goes in there, and the marker moves on after it', () => {
  const back = selectStep(moveMarker(sessionOf(threeSteps()), 2), 'op-1');
  const drafting = startDraft(back, draftGrowth(designHistory(back), 'part-1', 2));
  const added = confirmDraft(drafting);
  assert.equal(designHistory(added).length, 4);
  assert.equal(markerIndex(added), 3);
  assert.equal(designHistory(added)[2]?.id, added.selectedOperationId);
  assert.equal(added.draft, null);
});

test('a design change can be undone and redone', () => {
  const session = sessionOf(railHistory());
  const longer = withHistory(session, editProfile(railHistory(), 'part-1', { lengthMm: 1200 }));
  const back = undone(longer);
  assert.deepEqual(designHistory(back), railHistory());
  const again = present(redoEdit(back), 'an edit to redo');
  assert.deepEqual(designHistory(again), designHistory(longer));
  assert.equal(undoEdit(session), null);
  assert.equal(redoEdit(session), null);
});

test('a history change keeps the driver', () => {
  const driver = { statureMm: 1600 };
  const session = changeDesign(sessionOf(railHistory()), { history: railHistory(), driver });
  assert.deepEqual(withHistory(session, threeSteps()).design?.driver, driver);
});

test('a design change starts the measurement again, and ends it once no part is left', () => {
  const hit: PartHit = { partId: 'part-1', face: '+y', pointMm: { x: 0, y: 0, z: 0 } };
  const measuring = measureAt(setMeasuring(sessionOf(railHistory()), true), hit);
  assert.deepEqual(measuring.measurePicks, [hit]);
  const changed = withHistory(measuring, threeSteps());
  assert.deepEqual(changed.measurePicks, []);
  const emptied = withHistory(measuring, []);
  assert.equal(emptied.measurePicks, null);
});

test('a design change unselects a step that is gone and follows the last step past the end', () => {
  const session = moveMarker(selectStep(sessionOf(threeSteps()), 'op-3'), 3);
  const shorter = withHistory({ ...session, marker: 2 }, railHistory());
  assert.equal(selectedOperation(shorter), undefined);
  assert.equal(shorter.marker, null);
});

test('measuring drops the part being added', () => {
  const session = selectStep(sessionOf(railHistory()), 'op-1');
  const drafting = startDraft(session, draftGrowth(railHistory(), 'part-1'));
  const measuring = setMeasuring(drafting, true);
  assert.deepEqual(measuring.measurePicks, []);
  assert.equal(measuring.draft, null);
  assert.equal(setMeasuring(measuring, false).measurePicks, null);
});

test('a joint fastened at a moved marker keeps the marker after the same steps', () => {
  const back = moveMarker(sessionOf(threeSteps()), 2);
  const fastened = jointChange(back, (history, at) =>
    fastenWithBrackets(history, 'part-2@part-1', at),
  );
  assert.equal(designHistory(fastened).length, 4);
  assert.equal(designHistory(fastened)[2]?.kind, 'fasten-joint');
  assert.equal(markerIndex(fastened), 3);
});

test('a history change the design refuses gives its reason, and one that changes nothing says so', () => {
  const session = sessionOf(railHistory());
  const refused = historyChange(session, () => {
    throw new Error('Too long');
  });
  assert.deepEqual(refused, { kind: 'refused', message: 'Too long' });
  assert.deepEqual(
    historyChange(session, (history) => [...history]),
    { kind: 'unchanged' },
  );
  const changed = historyChange(session, (history) =>
    editProfile(history, 'part-1', { lengthMm: 1200 }),
  );
  assert.equal(changed.kind, 'changed');
});

test('the selected part shows its handles, and none while measuring', () => {
  const session = selectStep(sessionOf(railHistory()), 'op-1');
  assert.deepEqual(shownHandles(session, null), partHandles(railHistory(), 'part-1'));
  assert.deepEqual(shownHandles(setMeasuring(session, true), null), []);
});

test('fitting, a part of the frame without an adjustment has no handles', () => {
  const session = setFitting(selectStep(sessionOf(railHistory()), 'op-1'), true);
  assert.deepEqual(shownHandles(session, null), []);
});

test('a dragged change waits until it is confirmed, as one edit', () => {
  const session = selectStep(sessionOf(railHistory()), 'op-1');
  const [handle] = shownHandles(session, null);
  const end = present(handle, 'a handle');
  const dragging = present(
    changeInView(session, end, { symmetric: false, changeMm: 100 }),
    'a change',
  );
  assert.deepEqual(designHistory(dragging), railHistory());
  assert.equal(dragging.pendingChange?.partId, 'part-1');
  assert.deepEqual(shownJointMarkers(dragging), []);
  const confirmed = confirmChange(dragging);
  assert.equal(confirmed.pendingChange, null);
  assert.notDeepEqual(designHistory(confirmed), railHistory());
  assert.deepEqual(designHistory(undone(confirmed)), railHistory());
  assert.deepEqual(designHistory(cancelChange(dragging)), railHistory());
});

test('a change dragged back to where it started leaves the design as it was', () => {
  const session = selectStep(sessionOf(railHistory()), 'op-1');
  const end = present(shownHandles(session, null)[0], 'a handle');
  const dragging = present(
    changeInView(session, end, { symmetric: false, changeMm: 0 }),
    'a change',
  );
  const confirmed = confirmChange(dragging);
  assert.equal(confirmed.design, session.design);
  assert.equal(undoEdit(confirmed), null);
});

test('reopening keeps Fit as it was and starts everything else again', () => {
  const session = moveMarker(setFitting(selectStep(sessionOf(threeSteps()), 'op-1'), true), 1);
  const opened = reopened(session, designOf(railHistory()));
  assert.equal(opened.fitting, true);
  assert.equal(opened.marker, null);
  assert.equal(opened.selectedOperationId, null);
  assert.equal(undoEdit(opened), null);
});

test('a part added at a moved marker is selected, and the marker moves on after it', () => {
  const back = moveMarker(sessionOf(threeSteps()), 1);
  const added = withAddedPart(back, addAnchoredProfile(designHistory(back), 1));
  assert.equal(markerIndex(added), 2);
  assert.equal(selectedPartId(added), 'part-4');
});

test('removing the selected part adds its step at the marker and unselects it', () => {
  const back = selectStep(moveMarker(sessionOf(threeSteps()), 2), 'op-2');
  const removed = changedSession(removeSelectedPart(back));
  assert.equal(designHistory(removed)[2]?.kind, 'remove-part');
  assert.equal(markerIndex(removed), 3);
  assert.equal(removed.selectedOperationId, null);
});

test('deleting a selected step before the marker moves the marker back over it', () => {
  const fourSteps = withPlate(threeSteps(), 'part-1');
  const back = selectStep(moveMarker(sessionOf(fourSteps), 2), 'op-2');
  const deleted = changedSession(deleteSelectedStep(back));
  assert.equal(designHistory(deleted).length, 3);
  assert.equal(markerIndex(deleted), 1);
  assert.equal(deleted.selectedOperationId, null);
});

test('with nothing selected, removing or deleting changes nothing', () => {
  const session = sessionOf(threeSteps());
  assert.deepEqual(removeSelectedPart(session), { kind: 'unchanged' });
  assert.deepEqual(deleteSelectedStep(session), { kind: 'unchanged' });
});
