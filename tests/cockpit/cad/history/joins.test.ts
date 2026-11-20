import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  removePart,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import {
  fastenWithBrackets,
  joinParts,
  touchingParts,
} from '../../../../src/cockpit/cad/history/fastening.ts';
import { unsupportedParts } from '../../../../src/cockpit/cad/analysis/support.ts';
import { readDesign, designData, emptyDesign } from '../../../../src/cockpit/design.ts';
import { present } from '../../../support/lookups.ts';

/**
 * A: a 40 × 40 rail front to back, 1000 mm long, on the floor. D: an upright made on its own,
 * standing on the top of A halfway along it: they touch, but nothing joins them.
 */
function ad() {
  let history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'A',
    lengthMm: 1000,
  });
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    name: 'D',
    axis: 'y',
    lengthMm: 400,
    startMm: { x: 0, y: 40, z: 500 },
  });
  return history;
}
const jointsOf = (history: readonly Operation[]) => replayDesign(history).joints;

test('parts that touch can be joined, from either of them', () => {
  assert.deepEqual(touchingParts(ad(), 'part-1'), ['part-2']);
  assert.deepEqual(touchingParts(ad(), 'part-2'), ['part-1']);
  assert.deepEqual(jointsOf(ad()), [], 'touching makes no joint');
});

test('a join is a step, with the part that meets the other end on first', () => {
  const history = joinParts(ad(), 'part-1', 'part-2');
  assert.deepEqual(history[2], {
    kind: 'join-parts',
    id: 'op-3',
    partId: 'part-2',
    toPartId: 'part-1',
  });
  assert.deepEqual(jointsOf(history), [
    { id: 'part-2@part-1', partId: 'part-2', toPartId: 'part-1', toFace: '+y' },
  ]);
});

test('a joined part is supported through its joint, and the joint takes brackets', () => {
  const onFeet = addFoot(ad(), 'part-1').history;
  assert.deepEqual(unsupportedParts(replayDesign(onFeet).resolved), ['part-2']);
  const joined = joinParts(onFeet, 'part-2', 'part-1');
  const design = replayDesign(joined);
  assert.deepEqual(unsupportedParts(design.resolved, design.joints), []);
  const fastened = replayDesign(fastenWithBrackets(joined, 'part-2@part-1'));
  assert.equal(fastened.connectors.length, 2);
});

test('parts moved apart fail their join, and the fastening of that joint with it', () => {
  const joined = fastenWithBrackets(joinParts(ad(), 'part-1', 'part-2'), 'part-2@part-1');
  const apart = editProfile(joined, 'part-2', { startMm: { x: 0, y: 100, z: 500 } });
  const design = replayDesign(apart);
  assert.match(present(design.failures.get('op-3'), 'failure of op-3'), /D no longer touches A/);
  assert.match(present(design.failures.get('op-4'), 'failure of op-4'), /not joined/);
  assert.deepEqual(design.joints, []);
});

test('parts that do not touch, or are joined already, are not joined again', () => {
  const apart = editProfile(ad(), 'part-2', { startMm: { x: 300, y: 40, z: 500 } });
  assert.deepEqual(touchingParts(apart, 'part-1'), []);
  assert.throws(() => joinParts(apart, 'part-1', 'part-2'), /does not touch/);
  let grown = ad();
  grown = addOperation(grown, editDraft(grown, draftGrowth(grown, 'part-1'), { alongMm: 100 }));
  assert.ok(!touchingParts(grown, 'part-1').includes('part-3'));
  assert.throws(() => joinParts(grown, 'part-1', 'part-3'), /already joined/);
  const joined = joinParts(ad(), 'part-1', 'part-2');
  assert.deepEqual(touchingParts(joined, 'part-1'), []);
});

test('a join goes with a part that is removed', () => {
  const joined = joinParts(ad(), 'part-1', 'part-2');
  const design = replayDesign(removePart(joined, 'part-2'));
  assert.equal(design.failures.size, 0);
  assert.deepEqual(design.joints, []);
});

test('a join reads back, holding its two parts and nothing else', () => {
  const history = joinParts(ad(), 'part-1', 'part-2');
  const data = JSON.parse(JSON.stringify(designData({ ...emptyDesign(), history })));
  assert.deepEqual(readDesign(data).history, history);
  const extra = {
    ...data,
    history: [data.history[0], data.history[1], { ...history[2], face: '+y' }],
  };
  assert.throws(() => readDesign(extra), /face/);
});
