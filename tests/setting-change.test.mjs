import test from 'node:test';
import assert from 'node:assert/strict';
import { applySetting } from '../src/setting-change.ts';
import { defaults, placeDeskItem, editArm, resizeDesk } from '../src/model.ts';

test('resizing the desk keeps the desktop objects on it', () => {
  assert.deepEqual(
    applySetting(defaults, { kind: 'number', key: 'deskWidth', value: 120 }),
    resizeDesk(defaults, 120, defaults.deskDepth),
  );
});

test('a desktop object setting places the object again', () => {
  const moved = applySetting(defaults, { kind: 'number', key: 'keyboardX', value: 500 });
  assert.deepEqual(
    moved,
    placeDeskItem({ ...defaults, keyboardX: 500 }, 'keyboard', 500, defaults.keyboardZ),
  );
});

test('turning a desktop object on places it within the desk', () => {
  const state = { ...defaults, keyboardEnabled: false, keyboardX: 500 };
  assert.deepEqual(
    applySetting(state, { kind: 'toggle', key: 'keyboardEnabled', value: true }),
    placeDeskItem({ ...state, keyboardEnabled: true }, 'keyboard', 500, state.keyboardZ),
  );
});

test('a monitor mode goes through the arm rules', () => {
  assert.deepEqual(applySetting(defaults, { kind: 'choice', key: 'monitorMode', value: 'desk' }), {
    ...editArm(defaults, 'monitorMode', 'desk'),
    monitorMode: 'desk',
  });
});

test('other toggles and choices are set as they are', () => {
  assert.deepEqual(applySetting(defaults, { kind: 'toggle', key: 'roomFullWalls', value: true }), {
    ...defaults,
    roomFullWalls: true,
  });
  assert.deepEqual(applySetting(defaults, { kind: 'choice', key: 'armBend', value: 'negative' }), {
    ...defaults,
    armBend: 'negative',
  });
});

test('a choice outside its options fails loudly', () => {
  assert.throws(
    () => applySetting(defaults, { kind: 'choice', key: 'feet', value: 'wheels' }),
    /Invalid value for feet: wheels/,
  );
});
