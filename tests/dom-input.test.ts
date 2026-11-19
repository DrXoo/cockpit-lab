import test from 'node:test';
import assert from 'node:assert/strict';
import { numericField, roomItemType, booleanSetting, choiceSetting } from '../src/dom-input.ts';

test('a numeric setting key from the markup is checked against the settings', () => {
  assert.equal(numericField('deskH'), 'deskH');
  assert.throws(() => numericField('deskHeight'), /Unknown numeric setting: deskHeight/);
  assert.throws(() => numericField(undefined), /Unknown numeric setting/);
});

test('the settings of the retired parametric cockpit are unknown', () => {
  assert.throws(() => numericField('seatH'), /Unknown numeric setting: seatH/);
  assert.throws(() => booleanSetting('wheel'), /Unknown toggle: wheel/);
  assert.throws(() => choiceSetting('preset'), /Unknown choice: preset/);
});

test('inherited object keys are not settings', () => {
  assert.throws(() => numericField('constructor'));
  assert.throws(() => numericField('toString'));
});

test('room items are read from their known names', () => {
  assert.equal(roomItemType('wardrobeAccess'), 'wardrobeAccess');
  assert.equal(roomItemType('bed'), 'bed');
  assert.throws(() => roomItemType('sofa'), /Unknown room item: sofa/);
});

test('toggles and choices are told apart by their setting key', () => {
  assert.equal(booleanSetting('monitorEnabled'), 'monitorEnabled');
  assert.throws(() => booleanSetting('deskH'), /Unknown toggle: deskH/);
  assert.equal(choiceSetting('monitorMode'), 'monitorMode');
  assert.throws(() => choiceSetting('monitorEnabled'), /Unknown choice: monitorEnabled/);
});
