import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addOperation,
  deleteOperation,
  draftGrowth,
  editDraft,
  editProfile,
  removePart,
  replayDesign,
} from '../src/cad/history.ts';
import { jointsOf } from '../src/cad/joints.ts';

/** A: a rail front to back, 1000 mm long. B grows up out of it, 300 mm from its back end. */
function rail() {
  return editProfile(addAnchoredProfile([]).history, 'part-1', { name: 'A', lengthMm: 1000 });
}
function withGrowth(history, parentId, changes) {
  return addOperation(history, editDraft(history, draftGrowth(history, parentId), changes));
}
function ab() {
  return withGrowth(rail(), 'part-1', { name: 'B', alongMm: 300, lengthMm: 400 });
}
/** A and B, then C: a rail beside them, made on its own. */
function abc() {
  const history = ab();
  return editProfile(addAnchoredProfile(history).history, 'part-3', { name: 'C' });
}
const partIds = (design) => design.parts.map((part) => part.id);

test('a history that fits together replays with no failed operations', () => {
  const design = replayDesign(abc());
  assert.deepEqual(partIds(design), ['part-1', 'part-2', 'part-3']);
  assert.equal(design.failures.size, 0);
});

test('deleting an operation fails what relied on it and keeps the rest', () => {
  const history = deleteOperation(abc(), 'op-1');
  assert.deepEqual(
    history.map((operation) => operation.id),
    ['op-2', 'op-3'],
  );
  const design = replayDesign(history);
  assert.deepEqual(partIds(design), ['part-3']);
  assert.match(design.failures.get('op-2'), /deleted/);
  assert.equal(design.failures.has('op-3'), false);
});

test('an operation that fails adds nothing, and the ones that depend on it fail too', () => {
  let history = withGrowth(ab(), 'part-2', { name: 'D', face: '+z', lengthMm: 100 });
  history = editProfile(history, 'part-1', { lengthMm: 200 });
  const design = replayDesign(history);
  assert.deepEqual(partIds(design), ['part-1']);
  assert.match(design.failures.get('op-2'), /B would hang off A/);
  assert.match(design.failures.get('op-3'), /B, which failed/);
  const fixed = replayDesign(editProfile(history, 'part-1', { lengthMm: 1000 }));
  assert.equal(fixed.failures.size, 0, 'the failed operations apply again once A fits them');
});

test('an edit that would make the operation itself fail is refused', () => {
  assert.throws(() => editProfile(ab(), 'part-2', { alongMm: 2000 }), /B would hang off A/);
  const failing = editProfile(ab(), 'part-1', { lengthMm: 200 });
  const renamed = editProfile(failing, 'part-2', { name: 'Still B' });
  assert.equal(renamed[1].name, 'Still B', 'a failed operation can still be edited');
});

test('removing a part anchors what hangs from it where it is, from that step on', () => {
  const before = replayDesign(ab());
  const history = removePart(ab(), 'part-1');
  assert.deepEqual(history[2], { kind: 'remove-part', id: 'op-3', removedId: 'part-1' });
  const after = replayDesign(history);
  assert.deepEqual(partIds(after), ['part-2']);
  assert.equal(after.parts[0].placement.kind, 'anchor');
  assert.deepEqual(after.resolved.get('part-2').box, before.resolved.get('part-2').box);
  assert.deepEqual(jointsOf(after.resolved), [], 'its joints go with it');
  assert.deepEqual(partIds(replayDesign(history, 2)), ['part-1', 'part-2'], 'earlier it is there');
});

test('a span that reached a removed part keeps its length and reports its open end', () => {
  let history = editProfile(abc(), 'part-3', { startMm: { x: 500, y: 20, z: 0 } });
  history = withGrowth(history, 'part-1', { name: 'S', face: '+x', alongMm: 250 });
  history = editProfile(history, 'part-4', { reachesId: 'part-3' });
  const spanned = replayDesign(history).resolved.get('part-4');
  const removed = replayDesign(removePart(history, 'part-3')).resolved.get('part-4');
  assert.equal(removed.openEnd, true);
  assert.equal(removed.lengthMm, spanned.lengthMm);
  const deleted = replayDesign(deleteOperation(history, 'op-3'));
  assert.equal(deleted.resolved.get('part-4').openEnd, true);
  assert.equal(deleted.failures.size, 0);
});

test('a part brought too close to a span reaching it fails the span, not the edit', () => {
  let history = editProfile(abc(), 'part-3', { startMm: { x: 500, y: 20, z: 0 } });
  history = withGrowth(history, 'part-1', { name: 'S', face: '+x', alongMm: 250 });
  history = editProfile(history, 'part-4', { reachesId: 'part-3' });
  const close = editProfile(history, 'part-3', { startMm: { x: 45, y: 20, z: 0 } });
  assert.match(replayDesign(close).failures.get('op-4'), /C would be too close to S/);
});

test('removing a part that is not there at that step fails the removal', () => {
  const history = deleteOperation(removePart(ab(), 'part-2'), 'op-2');
  assert.match(replayDesign(history).failures.get('op-3'), /deleted/);
  assert.throws(() => removePart(ab(), 'part-7'), /part-7/);
});

test('the history marker shows the design at a step, and new operations go in there', () => {
  const history = abc();
  assert.deepEqual(partIds(replayDesign(history, 1)), ['part-1']);
  const inserted = addAnchoredProfile(history, 1);
  assert.deepEqual(
    inserted.history.map((operation) => operation.id),
    ['op-1', 'op-4', 'op-2', 'op-3'],
  );
  assert.equal(inserted.partId, 'part-4');
  const growth = draftGrowth(history, 'part-1', 1);
  assert.equal(addOperation(history, growth, 1)[1].partId, 'part-4');
  assert.throws(() => draftGrowth(history, 'part-3', 1), /part-3/, 'C is not made yet at step 1');
});

test('an operation moved before the part it grows from fails until that part comes first', () => {
  const [a, b] = ab();
  const design = replayDesign([b, a]);
  assert.match(design.failures.get('op-2'), /A, made at a later step/);
});

test('identifiers that a failed operation still refers to are not given to new parts', () => {
  const history = deleteOperation(ab(), 'op-1');
  assert.equal(addAnchoredProfile(history).partId, 'part-3');
});
