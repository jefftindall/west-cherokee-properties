import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHouseholdLeaseTerms,
  normalizeAdditionalOccupant,
  normalizeCoTenant,
} from './household.js';

test('normalizeCoTenant requires email or phone', () => {
  assert.throws(() => normalizeCoTenant({ displayName: 'Sam Tenant' }), /email or phone/);
  const byEmail = normalizeCoTenant({ displayName: 'Sam Tenant', email: 'sam@example.com' });
  assert.equal(byEmail.emailKey, 'sam@example.com');
  const byPhone = normalizeCoTenant({ displayName: 'Sam Tenant', phone: '(404) 555-0101' });
  assert.equal(byPhone.emailKey, 'phone:4045550101');
});

test('buildHouseholdLeaseTerms derives lease fields for a single adult', () => {
  const terms = buildHouseholdLeaseTerms({ primaryName: 'Jordan Tenant' });
  assert.deepEqual(terms.tenantNames, ['Jordan Tenant']);
  assert.equal(terms.authorizedOccupants, 'Jordan Tenant');
  assert.deepEqual(terms.coTenants, []);
  assert.deepEqual(terms.additionalOccupants, []);
});

test('buildHouseholdLeaseTerms includes co-tenants and related occupants', () => {
  const coTenants = [normalizeCoTenant({ displayName: 'Sam Tenant', email: 'sam@example.com' })];
  const additionalOccupants = [
    normalizeAdditionalOccupant({ name: 'Emma Tenant', relationship: 'biological child' }, 'Jordan Tenant'),
  ];
  const terms = buildHouseholdLeaseTerms({
    primaryName: 'Jordan Tenant',
    coTenants,
    additionalOccupants,
  });
  assert.deepEqual(terms.tenantNames, ['Jordan Tenant', 'Sam Tenant']);
  assert.match(terms.authorizedOccupants, /Jordan Tenant/);
  assert.match(terms.authorizedOccupants, /Sam Tenant/);
  assert.match(terms.authorizedOccupants, /Emma Tenant \(biological child of Jordan Tenant\)/);
});
