import test from 'node:test';
import assert from 'node:assert/strict';
import { deleteKeyAction, partToolsOf } from '../../../src/cockpit/editor/part-tools.ts';
import { addFoot, removePart, type RemovePart } from '../../../src/cockpit/cad/history/history.ts';
import {
  anchoredProfiles,
  plateHistory,
  railHistory,
  withGrowth,
  withPeripheral,
} from '../../support/designs.ts';

const fitting = { fitting: true };

test('a profile grows a profile, takes a plate and a foot, and can be removed', () => {
  assert.deepEqual(partToolsOf(anchoredProfiles(1)[0]), ['grow', 'plate', 'foot', 'remove']);
});

test('a plate or a foot can only be removed', () => {
  assert.deepEqual(partToolsOf(plateHistory()[1]), ['remove']);
  const { history } = addFoot(anchoredProfiles(1), 'part-1');
  assert.deepEqual(partToolsOf(history[1]), ['remove']);
});

test('a failed step, one that makes no part, or no step at all has no tools', () => {
  const history = anchoredProfiles(1);
  assert.deepEqual(partToolsOf(history[0], 'It grows out of a part that was deleted.'), []);
  assert.deepEqual(partToolsOf(removePart(railHistory(), 'part-1')[1]), []);
  assert.deepEqual(partToolsOf(undefined), []);
});

test('the Delete key removes the selected part, or deletes a step that makes none', () => {
  const history = withGrowth(railHistory(), 'part-1');
  assert.equal(deleteKeyAction(history[1]), 'remove-part');
  assert.equal(
    deleteKeyAction(history[1], 'It grows out of a part that was deleted.'),
    'delete-step',
  );
  const removal: RemovePart = { kind: 'remove-part', id: 'op-3', removedId: 'part-2' };
  assert.equal(deleteKeyAction(removal), 'delete-step');
  assert.equal(deleteKeyAction(undefined), null);
});

test('in Fit, a plate or a profile mounts peripherals, and a peripheral can be removed', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.deepEqual(partToolsOf(history[0], undefined, fitting), ['mount']);
  assert.deepEqual(partToolsOf(history[1], undefined, fitting), ['remove']);
  assert.deepEqual(partToolsOf(plateHistory()[1], undefined, fitting), ['mount']);
  assert.deepEqual(partToolsOf(history[1]), [], 'out of Fit a peripheral is only a reference');
});

test('in Fit, the Delete key leaves the frame alone and removes a peripheral', () => {
  const history = withPeripheral(railHistory(), 'part-1', 'generic-pedals');
  assert.equal(deleteKeyAction(history[0], undefined, fitting), null);
  assert.equal(deleteKeyAction(history[1], undefined, fitting), 'remove-part');
  assert.equal(deleteKeyAction(history[1]), null, 'out of Fit a peripheral is left alone');
});
