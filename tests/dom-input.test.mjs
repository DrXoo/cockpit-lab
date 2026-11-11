import test from 'node:test';
import assert from 'node:assert/strict';
import {
  numericField,
  presetId,
  roomItemType,
  layoutPresetName,
  booleanSetting,
  choiceSetting,
} from '../src/dom-input.ts';

test('a numeric setting key from the markup is checked against the settings', () => {
  assert.equal(numericField('seatH'), 'seatH');
  assert.throws(() => numericField('seatHeight'), /Unknown numeric setting: seatHeight/);
  assert.throws(() => numericField(undefined), /Unknown numeric setting/);
});

test('inherited object keys are not settings', () => {
  assert.throws(() => numericField('constructor'));
  assert.throws(() => numericField('toString'));
});

test('presets, room items and layouts are read from their known names', () => {
  assert.equal(presetId('flight'), 'flight');
  assert.throws(() => presetId('rally'), /Unknown preset: rally/);
  assert.equal(roomItemType('wardrobeAccess'), 'wardrobeAccess');
  assert.equal(roomItemType('bed'), 'bed');
  assert.throws(() => roomItemType('sofa'), /Unknown room item: sofa/);
  assert.equal(layoutPresetName('front'), 'front');
  assert.throws(() => layoutPresetName('free'), /Unknown layout: free/);
});

test('toggles and choices are told apart by their setting key', () => {
  assert.equal(booleanSetting('wheel'), 'wheel');
  assert.throws(() => booleanSetting('seatH'), /Unknown toggle: seatH/);
  assert.equal(choiceSetting('monitorMode'), 'monitorMode');
  assert.throws(() => choiceSetting('wheel'), /Unknown choice: wheel/);
});
