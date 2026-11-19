import test from 'node:test';
import assert from 'node:assert/strict';
import { canRedo, canUndo, MAX_UNDO_STEPS, noEdits, recordEdit, redo, undo } from '../src/undo.ts';

test('nothing can be undone or redone before the first edit', () => {
  assert.equal(canUndo(noEdits()), false);
  assert.equal(canRedo(noEdits()), false);
  assert.equal(undo(noEdits(), 'a'), null);
  assert.equal(redo(noEdits(), 'a'), null);
});

test('undo goes back through the edits, and redo forward again', () => {
  let edits = recordEdit(recordEdit(noEdits(), 'a'), 'b');
  let value = 'c';
  ({ edits, value } = undo(edits, value));
  assert.equal(value, 'b');
  ({ edits, value } = undo(edits, value));
  assert.equal(value, 'a');
  assert.equal(canUndo(edits), false);
  ({ edits, value } = redo(edits, value));
  assert.equal(value, 'b');
  ({ edits, value } = redo(edits, value));
  assert.equal(value, 'c');
  assert.equal(canRedo(edits), false);
});

test('a new edit after undoing drops what could be redone', () => {
  const { edits } = undo(recordEdit(noEdits(), 'a'), 'b');
  const next = recordEdit(edits, 'a');
  assert.equal(canRedo(next), false);
  assert.equal(undo(next, 'x').value, 'a');
});

test('only the latest edits are kept', () => {
  let edits = noEdits();
  for (let i = 0; i < MAX_UNDO_STEPS + 5; i++) edits = recordEdit(edits, i);
  let value = 'now';
  let steps = 0;
  while (canUndo(edits)) {
    ({ edits, value } = undo(edits, value));
    steps++;
  }
  assert.equal(steps, MAX_UNDO_STEPS);
  assert.equal(value, 5);
});
