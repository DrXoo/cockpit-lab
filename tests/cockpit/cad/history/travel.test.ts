import test from 'node:test';
import assert from 'node:assert/strict';
import { replayDesign, type Operation } from '../../../../src/cockpit/cad/history/history.ts';
import { addAdjustment, editAdjustment } from '../../../../src/cockpit/cad/history/adjustments.ts';
import { travelInterferences } from '../../../../src/cockpit/cad/history/travel.ts';
import { railHistory, withGrowth } from '../../../support/designs.ts';

/** The rail with Post halfway along its top, part-2, and Other post 60 mm in front, part-3. */
function twoPosts() {
  const posted = withGrowth(railHistory(), 'part-1', { name: 'Post', lengthMm: 200 });
  return withGrowth(posted, 'part-1', { name: 'Other post', alongMm: 560, lengthMm: 200 });
}
const found = (history: readonly Operation[]) => {
  const design = replayDesign(history);
  return travelInterferences(history, design.resolved, design.connectors).map(
    ({ movedId, endMm, interference }) => [
      movedId,
      endMm,
      interference.partId,
      interference.otherId,
      interference.depthMm,
    ],
  );
};

test('interference is checked at both ends of a travel, saying which end', () => {
  const history = addAdjustment(twoPosts(), 'part-2');
  assert.deepEqual(found(history), [['part-2', 50, 'part-2', 'part-3', 30]]);
});

test('each travel is checked on its own, with the other parts where they are', () => {
  let history = addAdjustment(addAdjustment(twoPosts(), 'part-2'), 'part-3');
  // Post spans 480–520 mm along the rail. Other post at +30 spans 570–610: Post at its front
  // end only touches it, and Other post at its back end, 490–530, reaches 30 mm into Post.
  history = editAdjustment(history, 'part-3', { positionMm: 30 });
  assert.deepEqual(found(history), [['part-3', -50, 'part-2', 'part-3', 30]]);
  // At −10 it spans 530–570, clear of Post, which at its front end reaches 40 mm into it.
  assert.deepEqual(found(editAdjustment(history, 'part-3', { positionMm: -10 })), [
    ['part-2', 50, 'part-2', 'part-3', 40],
    ['part-3', -50, 'part-2', 'part-3', 30],
  ]);
});

test('a pair that already meets where the parts are is not listed again at an end', () => {
  const history = editAdjustment(addAdjustment(twoPosts(), 'part-2'), 'part-2', { positionMm: 40 });
  assert.deepEqual(found(history), []);
});

test('a design without adjustments has nothing to check along a travel', () => {
  assert.deepEqual(found(twoPosts()), []);
});
