import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addFoot,
  addOperation,
  deleteOperation,
  draftGrowth,
  editDraft,
  editFoot,
  editProfile,
  facingParts,
  removePart,
  replayDesign,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import { ofKind, present } from '../../../support/lookups.ts';
import { unsupportedParts } from '../../../../src/cockpit/cad/analysis/support.ts';

/** A: a 40 × 40 rail front to back, 1000 mm long, lying on the floor. */
function rail() {
  return editProfile(addAnchoredProfile([]).history, 'part-1', { name: 'A', lengthMm: 1000 });
}
const resolvedOf = (history: readonly Operation[], partId: string) =>
  present(replayDesign(history).resolved.get(partId), partId);

test('a foot goes under the start of a profile, flush with its end', () => {
  const { history, partId } = addFoot(rail(), 'part-1');
  assert.equal(partId, 'part-2');
  assert.deepEqual(history[1], {
    kind: 'add-foot',
    id: 'op-2',
    partId: 'part-2',
    name: 'Leveling foot 2',
    footTypeId: 'leveling-foot',
    parentId: 'part-1',
    fromEnd: 'start',
    alongMm: 36,
  });
  const a = resolvedOf(history, 'part-1');
  const foot = resolvedOf(history, 'part-2');
  assert.equal(foot.box.max.y, a.box.min.y, 'it stands under the underside');
  assert.equal(foot.box.min.z, a.box.min.z, 'flush with the start');
});

test('the next foot goes under the end that has fewer', () => {
  const first = addFoot(rail(), 'part-1').history;
  const second = addFoot(first, 'part-1').history;
  assert.equal(ofKind(second[2], 'add-foot').fromEnd, 'end');
  assert.equal(resolvedOf(second, 'part-3').box.max.z, resolvedOf(second, 'part-1').box.max.z);
  assert.equal(ofKind(addFoot(second, 'part-1').history[3], 'add-foot').fromEnd, 'start');
});

test('a foot under an upright stands under its end', () => {
  const upright = editProfile(rail(), 'part-1', { axis: 'y' });
  const { history } = addFoot(upright, 'part-1');
  assert.equal(ofKind(history[1], 'add-foot').alongMm, 0);
  assert.equal(resolvedOf(history, 'part-2').box.max.y, resolvedOf(history, 'part-1').box.min.y);
});

test('the inspector changes the type, the name and the place of a foot', () => {
  const { history } = addFoot(rail(), 'part-1');
  const edited = editFoot(history, 'part-2', {
    name: 'Front caster',
    footTypeId: 'locking-caster',
    fromEnd: 'end',
    alongMm: 100,
  });
  assert.deepEqual(edited[1], {
    ...history[1],
    name: 'Front caster',
    footTypeId: 'locking-caster',
    fromEnd: 'end',
    alongMm: 100,
  });
  assert.throws(() => editFoot(history, 'part-2', { footTypeId: 'wheel' }), /wheel/);
  assert.throws(() => editFoot(history, 'part-2', { alongMm: -5 }), /0 mm or more/);
  assert.throws(() => editFoot(history, 'part-2', { alongMm: 1200 }), /hang off A/);
  assert.throws(() => editFoot(history, 'part-1', { alongMm: 10 }), /not a foot/);
  assert.throws(() => editProfile(history, 'part-2', { lengthMm: 300 }), /foot/);
});

test('a profile shortened so that its foot would hang off fails the foot', () => {
  const { history } = addFoot(rail(), 'part-1');
  const moved = editFoot(history, 'part-2', { alongMm: 900 });
  const shortened = editProfile(moved, 'part-1', { lengthMm: 500 });
  assert.match(
    present(replayDesign(shortened).failures.get('op-2'), 'failure of op-2'),
    /Leveling foot 2 would hang off A/,
  );
});

test('a foot fails when its profile is deleted, and goes with it when it is removed', () => {
  const { history } = addFoot(rail(), 'part-1');
  assert.match(
    present(replayDesign(deleteOperation(history, 'op-1')).failures.get('op-2'), 'failure of op-2'),
    /stands under a part that was deleted/,
  );
  const removed = replayDesign(removePart(history, 'part-1'));
  assert.equal(removed.failures.size, 0);
  assert.deepEqual([...removed.resolved.keys()], []);
});

test('a foot can be removed on its own', () => {
  const { history } = addFoot(rail(), 'part-1');
  assert.deepEqual([...replayDesign(removePart(history, 'part-2')).resolved.keys()], ['part-1']);
});

test('feet support the profile they stand under and what is joined to it', () => {
  let history = addFoot(rail(), 'part-1').history;
  history = addOperation(history, editDraft(history, draftGrowth(history, 'part-1'), {}));
  assert.deepEqual(unsupportedParts(replayDesign(history).resolved), []);
});

test('nothing grows out of a foot, and spans do not reach one', () => {
  const { history } = addFoot(rail(), 'part-1');
  assert.throws(() => draftGrowth(history, 'part-2'), /foot/);
  assert.throws(() => addFoot(history, 'part-2'), /profile/);
  assert.ok(!facingParts(history, 'part-1').includes('part-2'));
});
