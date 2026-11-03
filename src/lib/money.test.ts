import assert from 'node:assert/strict';
import test from 'node:test';
import { formatMoney } from './money.ts';

test('formatMoney uses USD with thousands separators', () => {
  assert.equal(formatMoney(155000), '$1,550.00');
  assert.equal(formatMoney(100), '$1.00');
  assert.equal(formatMoney(0), '$0.00');
  assert.equal(formatMoney(1_234_567), '$12,345.67');
});

test('formatMoney treats non-finite as zero', () => {
  assert.equal(formatMoney(Number.NaN), '$0.00');
});
