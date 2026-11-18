import test from 'node:test';
import assert from 'node:assert/strict';
import { addAnchoredProfile, draftGrowth, editDraft, editProfile } from '../src/cad/history.ts';
import { draftPlate } from '../src/cad/plates.ts';
import { draggedHistory, partHandles } from '../src/cad/handles.ts';
import { snapToParts } from '../src/cad/snapping.ts';
import { draftEditedBy, withDraft } from '../src/cad/drafts.ts';

/** A 40 × 40 rail along Z from the origin, 1000 mm long, lying on the floor: part-1. */
const railHistory = () => {
  const { history, partId } = addAnchoredProfile([]);
  return editProfile(history, partId, { name: 'Rail', lengthMm: 1000 });
};
/** The rail and a second one at x = 800, its −x face at 780: part-2. */
const twoRails = () => {
  const added = addAnchoredProfile(railHistory());
  return editProfile(added.history, added.partId, { startMm: { x: 800, y: 20, z: 0 } });
};
/** A profile about to grow out of the rail's +x face, 300 mm long. */
const growing = (history) =>
  editDraft(history, draftGrowth(history, 'part-1'), { face: '+x', lengthMm: 300 });
const handleOf = (history, draft, id) =>
  partHandles(withDraft(history, draft, history.length), draft.partId, history.length + 1).find(
    (handle) => handle.id === `${draft.partId}:${id}`,
  );
/** The draft once its handle `id` is dragged as given. */
const dragged = (history, draft, id, drag) =>
  draftEditedBy(history, draft, history.length, (shown) =>
    draggedHistory(shown, handleOf(history, draft, id), drag),
  );

test('the view shows a part about to be added at the history marker', () => {
  const history = twoRails();
  const draft = growing(history);
  assert.deepEqual(
    withDraft(history, draft, 1).map(({ id }) => id),
    ['op-1', draft.id, 'op-2'],
  );
});

test('a profile about to grow has the handles of a grown profile', () => {
  const history = railHistory();
  const draft = growing(history);
  assert.ok(handleOf(history, draft, 'end'));
  assert.ok(handleOf(history, draft, 'move:z'));
});

test('dragging a handle of a part about to be added changes it, and not the design', () => {
  const history = railHistory();
  const draft = growing(history);
  const longer = dragged(history, draft, 'end', { changeMm: 120, symmetric: false });
  assert.equal(longer.lengthMm, 420);
  assert.equal(longer.id, draft.id);
  const moved = dragged(history, draft, 'move:z', { changeMm: 100, symmetric: false });
  assert.equal(moved.alongMm, draft.alongMm + 100);
  assert.equal(history.length, 1);
});

test('a profile about to grow reaches a part in front of it, and is added as a span', () => {
  const history = twoRails();
  const draft = growing(history);
  const handle = handleOf(history, draft, 'end');
  const shown = withDraft(history, draft, history.length);
  const { drag } = snapToParts(shown, handle, { changeMm: 455, symmetric: false }, 10);
  const span = dragged(history, draft, 'end', drag);
  assert.equal(span.reachesId, 'part-2');
  assert.equal(span.lengthMm, 760);
});

test('an edit that would put a part about to be added off its parent is refused', () => {
  const history = railHistory();
  const plate = draftPlate(history, 'part-1');
  assert.throws(() => dragged(history, plate, 'move:z', { changeMm: 900, symmetric: false }));
});
