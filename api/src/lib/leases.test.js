import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUnitVacant, normalizeLease } from './leases.js';

test('one active lease per unit', () => {
  const leases = [{ id: 'l1', unitId: 'u1', status: 'active' }];
  assert.throws(() => assertUnitVacant(leases, 'u1'), /already has an active lease/);
  assert.doesNotThrow(() => assertUnitVacant(leases, 'u2'));
});

test('normalizeLease requires rent cents', () => {
  assert.throws(
    () => normalizeLease({ unitId: 'u1', personId: 'p1', startDate: '2026-01-01', endDate: '2026-12-31', rentCents: 0 }),
    /rentCents/,
  );
});
