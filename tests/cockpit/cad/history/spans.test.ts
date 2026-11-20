import test from 'node:test';
import assert from 'node:assert/strict';
import {
  addAnchoredProfile,
  addOperation,
  draftGrowth,
  editDraft,
  editProfile,
  facingParts,
  replayDesign,
  replayHistory,
  type Operation,
} from '../../../../src/cockpit/cad/history/history.ts';
import { ofKind, present } from '../../../support/lookups.ts';
import { resolveAssembly } from '../../../../src/cockpit/cad/parts/assembly.ts';

/**
 * A and C: two 40 × 40 rails front to back, 1000 mm long, with C 500 mm to the left of A.
 * B grows out of the left side of A, halfway along it, towards C.
 */
function abc() {
  let history = editProfile(addAnchoredProfile([]).history, 'part-1', {
    name: 'A',
    lengthMm: 1000,
  });
  history = editProfile(addAnchoredProfile(history).history, 'part-2', {
    name: 'C',
    lengthMm: 1000,
    startMm: { x: 500, y: 20, z: 0 },
  });
  const draft = editDraft(history, draftGrowth(history, 'part-1'), {
    name: 'B',
    face: '+x',
    alongMm: 500,
    lengthMm: 200,
  });
  return addOperation(history, draft);
}
const resolvedOf = (history: readonly Operation[], partId: string) =>
  present(resolveAssembly(replayHistory(history)).get(partId), partId);
const span = (history: readonly Operation[]) => ofKind(history[2], 'grow-profile');

test('a profile can reach the facing face of the parts in front of its free end', () => {
  assert.deepEqual(facingParts(abc(), 'part-3'), ['part-2']);
  assert.deepEqual(facingParts(abc(), 'part-1'), [], 'an anchored profile has no free end');
});

test('B grows out of A and reaches C, and moving C changes the length of B', () => {
  const spanned = editProfile(abc(), 'part-3', { reachesId: 'part-2' });
  assert.equal(resolvedOf(spanned, 'part-3').lengthMm, 460);
  assert.equal(span(spanned).lengthMm, 460, 'the operation keeps the length it last took');
  const moved = editProfile(spanned, 'part-2', { startMm: { x: 600, y: 20, z: 0 } });
  assert.equal(resolvedOf(moved, 'part-3').lengthMm, 560);
  assert.equal(span(moved).lengthMm, 560);
});

test('when the faces stop facing, the span keeps its last length and reports its open end', () => {
  const spanned = editProfile(abc(), 'part-3', { reachesId: 'part-2' });
  const away = editProfile(spanned, 'part-2', { startMm: { x: 500, y: 20, z: 600 } });
  const b = resolvedOf(away, 'part-3');
  assert.equal(b.openEnd, true);
  assert.equal(b.lengthMm, 460);
});

test('detaching the end of a span keeps the length it had', () => {
  const spanned = editProfile(abc(), 'part-3', { reachesId: 'part-2' });
  const free = editProfile(spanned, 'part-3', { reachesId: null });
  assert.equal(span(free).reachesId, undefined);
  assert.equal(span(free).lengthMm, 460);
  assert.equal(resolvedOf(free, 'part-3').part.placement.kind, 'attachment');
});

test('a span takes its length from the gap, so the length is not edited directly', () => {
  const spanned = editProfile(abc(), 'part-3', { reachesId: 'part-2' });
  assert.throws(() => editProfile(spanned, 'part-3', { lengthMm: 300 }), /C/);
  assert.throws(() => editProfile(spanned, 'part-3', { way: '+z' }), /lying|lies/);
});

test('a span cannot reach a part that is not in front of it or that hangs from it', () => {
  assert.throws(() => editProfile(abc(), 'part-3', { reachesId: 'part-1' }), /A/);
  assert.throws(() => editProfile(abc(), 'part-3', { reachesId: 'part-9' }), /part-9/);
  let history = abc();
  history = addOperation(
    history,
    editDraft(history, draftGrowth(history, 'part-3'), { name: 'D', face: '+y' }),
  );
  assert.ok(!facingParts(history, 'part-3').includes('part-4'));
  assert.throws(() => editProfile(history, 'part-3', { reachesId: 'part-4' }), /D/);
});

test('a part moved so close that a span reaching it would be too short fails the span', () => {
  const spanned = editProfile(abc(), 'part-3', { reachesId: 'part-2' });
  const close = editProfile(spanned, 'part-2', { startMm: { x: 45, y: 20, z: 0 } });
  assert.match(
    present(replayDesign(close).failures.get('op-3'), 'failure of op-3'),
    /C would be too close to B/,
  );
});
