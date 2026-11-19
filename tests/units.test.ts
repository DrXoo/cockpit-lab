import test from 'node:test';
import assert from 'node:assert/strict';
import { cmToMm, mmToCm, roundMm, MM_PER_CM } from '../src/units.ts';

test('cm and mm convert explicitly in both directions', () => {
  assert.equal(MM_PER_CM, 10);
  assert.equal(cmToMm(12.5), 125);
  assert.equal(mmToCm(65), 6.5);
  assert.equal(mmToCm(cmToMm(37.2)), 37.2);
});

test('roundMm rounds to whole millimetres, as cut lengths are given', () => {
  assert.equal(roundMm(cmToMm(14.56)), 146);
  assert.equal(roundMm(cmToMm(14.54)), 145);
});
