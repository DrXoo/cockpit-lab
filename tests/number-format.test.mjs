import test from 'node:test';
import assert from 'node:assert/strict';
import { formatNumber } from '../src/number-format.ts';

test('numbers use a decimal point and group thousands with commas', () => {
  assert.equal(formatNumber(1.5), '1.5');
  assert.equal(formatNumber(1234.567, 2), '1,234.57');
});

test('trailing zeros are left out', () => {
  assert.equal(formatNumber(2, 2), '2');
  assert.equal(formatNumber(0.1 + 0.2), '0.3');
});
