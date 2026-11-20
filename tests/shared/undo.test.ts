import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canRedo,
  canUndo,
  MAX_UNDO_STEPS,
  noEdits,
  recordEdit,
  redo,
  undo,
  type Edits,
} from '../../src/shared/undo.ts';
import { present } from '../support/lookups.ts';

const undone = <T>(edits: Edits<T>, value: T) => present(undo(edits, value), 'an edit to undo');
const redone = <T>(edits: Edits<T>, value: T) => present(redo(edits, value), 'an edit to redo');

test('nothing can be undone or redone before the first edit', () => {
  assert.equal(canUndo(noEdits()), false);
  assert.equal(canRedo(noEdits()), false);
  assert.equal(undo(noEdits(), 'a'), null);
  assert.equal(redo(noEdits(), 'a'), null);
});

test('undo goes back through the edits, and redo forward again', () => {
  let edits = recordEdit(recordEdit(noEdits<string>(), 'a'), 'b');
  let value = 'c';
  ({ edits, value } = undone(edits, value));
  assert.equal(value, 'b');
  ({ edits, value } = undone(edits, value));
  assert.equal(value, 'a');
  assert.equal(canUndo(edits), false);
  ({ edits, value } = redone(edits, value));
  assert.equal(value, 'b');
  ({ edits, value } = redone(edits, value));
  assert.equal(value, 'c');
  assert.equal(canRedo(edits), false);
});

test('a new edit after undoing drops what could be redone', () => {
  const { edits } = undone(recordEdit(noEdits<string>(), 'a'), 'b');
  const next = recordEdit(edits, 'a');
  assert.equal(canRedo(next), false);
  assert.equal(undone(next, 'x').value, 'a');
});

test('only the latest edits are kept', () => {
  let edits = noEdits<number | string>();
  for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) edits = recordEdit(edits, i);
  let value: number | string = 'now';
  let steps = 0;
  while (canUndo(edits)) {
    ({ edits, value } = undone(edits, value));
    steps++;
  }
  assert.equal(steps, MAX_UNDO_STEPS);
  assert.equal(value, 5);
});
