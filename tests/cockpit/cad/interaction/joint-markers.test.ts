import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
} from '../../../../src/cockpit/cad/history/history.ts';
import { fastenWithBrackets, joinParts } from '../../../../src/cockpit/cad/history/fastening.ts';
import {
  jointMarkers,
  type JointMarker,
} from '../../../../src/cockpit/cad/interaction/joint-markers.ts';
import { draftPlate } from '../../../../src/cockpit/cad/history/plates.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';

const JOINT = 'part-2@part-1';

/**
 * A: a 40 × 40 rail front to back, 1000 mm long, on the floor. B: an upright growing out of its
 * top, 500 mm from its back end.
 */
function ab() {
  const history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'A',
    lengthMm: 1000,
  });
  return addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-1'), { name: 'B', alongMm: 500, lengthMm: 300 }),
  );
}
/** A and, beside it, C: another rail whose −x side lies on A's +x side, without a joint. */
function besideA() {
  const history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'A',
    lengthMm: 1000,
  });
  const added = addAnchoredProfile(history);
  return editProfile(added.history, added.partId, {
    name: 'C',
    lengthMm: 600,
    startMm: { x: 40, y: 20, z: 0 },
  });
}
const summary = (markers: readonly JointMarker[]) =>
  markers.map(({ id, state, pointMm }) => [id, state, pointMm]);

test('a joint without connectors is marked where its parts meet, selected or not', () => {
  const expected = [[JOINT, 'pending', { x: 0, y: 40, z: 500 }]];
  assert.deepEqual(summary(jointMarkers(ab(), null)), expected);
  assert.deepEqual(summary(jointMarkers(ab(), 'part-1')), expected);
});

test('a fastened joint is marked only while one of its parts is selected', () => {
  const fastened = fastenWithBrackets(ab(), JOINT);
  assert.deepEqual(jointMarkers(fastened, null), []);
  assert.deepEqual(summary(jointMarkers(fastened, 'part-2')), [
    [JOINT, 'fastened', { x: 0, y: 40, z: 500 }],
  ]);
});

test('two parts that touch without a joint are marked in the middle of where they touch', () => {
  const markers = jointMarkers(besideA(), null);
  assert.deepEqual(
    markers.map(({ state, partId, toPartId, pointMm }) => [state, partId, toPartId, pointMm]),
    [['touching', 'part-1', 'part-2', { x: 20, y: 20, z: 300 }]],
  );
  const joined = joinParts(besideA(), 'part-1', 'part-2');
  assert.deepEqual(
    jointMarkers(joined, null).map(({ state }) => state),
    ['pending'],
  );
});

test('the markers are those of the design at the history marker', () => {
  assert.deepEqual(jointMarkers(ab(), null, 1), []);
});

test('a marker sits where its parts are drawn, along the travel of an adjusted part', () => {
  const rail = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'Rail',
    lengthMm: 1000,
  });
  const plated = addAdjustment(addOperation(rail, draftPlate(rail, 'part-1')), 'part-2');
  const slid = editAdjustment(plated, 'part-2', { positionMm: 20 });
  const [marker] = jointMarkers(slid, null);
  assert.equal(marker.id, 'part-2@part-1');
  assert.equal(marker.pointMm.z, 520);
});
