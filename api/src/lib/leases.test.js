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

test('normalizeLease stores pet terms', () => {
  const lease = normalizeLease({
    unitId: 'unit-11-noble',
    personId: 'p1',
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 90000,
    terms: { tenantNames: 'Jordan Tenant', petCount: 2, approvedPets: 'Two dogs', securityDepositCents: 90000 },
  });
  assert.equal(lease.terms.petCount, 2);
  assert.equal(lease.terms.approvedPets, 'Two dogs');
});
