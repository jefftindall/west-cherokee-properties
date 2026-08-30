import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveLeaseHousehold } from './household.js';
import { resetStoreForTests } from './store.js';
import { defaultTermsForUnit } from './leaseTerms.js';

test('resolveLeaseHousehold builds terms from renter records', async () => {
  const store = resetStoreForTests();
  const primary = await store.upsertPerson({
    displayName: 'Jordan Tenant',
    email: 'jordan@example.com',
  });
  const coTenant = await store.upsertPerson({
    displayName: 'Sam Tenant',
    email: 'sam@example.com',
  });
  const { householdTerms } = await resolveLeaseHousehold(store, {
    personId: primary.id,
    coTenantPersonIds: [coTenant.id],
    additionalOccupants: [{ name: 'Emma Tenant', relationship: 'biological child' }],
  });
  assert.deepEqual(householdTerms.tenantNames, ['Jordan Tenant', 'Sam Tenant']);
  assert.match(householdTerms.authorizedOccupants, /Emma Tenant \(biological child of Jordan Tenant\)/);
  assert.equal(householdTerms.coTenants?.[0]?.personId, coTenant.id);
});

test('create lease stores household members from renter records', async () => {
  const store = resetStoreForTests();
  const primary = await store.upsertPerson({
    displayName: 'Jordan Tenant',
    email: 'jordan@example.com',
    phone: '4045550100',
  });
  const coTenant = await store.upsertPerson({
    displayName: 'Sam Tenant',
    email: 'sam@example.com',
  });
  const { householdTerms } = await resolveLeaseHousehold(store, {
    personId: primary.id,
    coTenantPersonIds: [coTenant.id],
    additionalOccupants: [{ name: 'Emma Tenant', relationship: 'biological child' }],
  });
  const terms = defaultTermsForUnit('unit-11-noble', {
    ...householdTerms,
    rentCents: 90000,
    startDate: '2026-09-01',
    displayName: primary.displayName,
    maxOccupants: 3,
    securityDepositCents: 90000,
  });
  const lease = await store.createLease({
    unitId: 'unit-11-noble',
    personId: primary.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 90000,
    terms,
  });

  assert.deepEqual(lease.terms.tenantNames, ['Jordan Tenant', 'Sam Tenant']);
  assert.match(lease.terms.authorizedOccupants, /Emma Tenant \(biological child of Jordan Tenant\)/);
  assert.equal(lease.terms.coTenants?.length, 1);
  assert.equal(lease.terms.coTenants?.[0]?.personId, coTenant.id);
});

test('phone-only co-tenant gets synthetic email key', async () => {
  const store = resetStoreForTests();
  const person = await store.upsertPerson({ displayName: 'Riley Tenant', phone: '(678) 885-7368' });
  assert.equal(person.emailKey, 'phone:6788857368');
  assert.equal(person.email, '');
});
