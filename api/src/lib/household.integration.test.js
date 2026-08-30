import assert from 'node:assert/strict';
import test from 'node:test';
import { buildHouseholdLeaseTerms, normalizeAdditionalOccupant, normalizeCoTenant } from './household.js';
import { createMemoryStore, resetStoreForTests } from './store.js';
import { defaultTermsForUnit } from './leaseTerms.js';

test('create lease stores household members and co-tenant person records', async () => {
  const store = resetStoreForTests();
  const primaryName = 'Jordan Tenant';
  const coTenants = [];
  for (const row of [{ displayName: 'Sam Tenant', email: 'sam@example.com' }]) {
    const normalized = normalizeCoTenant(row);
    const person = await store.upsertPerson({
      displayName: normalized.displayName,
      email: normalized.email,
      phone: normalized.phone,
    });
    coTenants.push({ ...normalized, personId: person.id });
  }
  const additionalOccupants = [
    normalizeAdditionalOccupant({ name: 'Emma Tenant', relationship: 'biological child' }, primaryName),
  ];
  const householdTerms = buildHouseholdLeaseTerms({ primaryName, coTenants, additionalOccupants });
  const person = await store.upsertPerson({
    displayName: primaryName,
    email: 'jordan@example.com',
    phone: '4045550100',
  });
  const terms = defaultTermsForUnit('unit-11-noble', {
    ...householdTerms,
    rentCents: 90000,
    startDate: '2026-09-01',
    displayName: person.displayName,
    maxOccupants: 3,
    securityDepositCents: 90000,
  });
  const lease = await store.createLease({
    unitId: 'unit-11-noble',
    personId: person.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 90000,
    terms,
  });

  assert.deepEqual(lease.terms.tenantNames, ['Jordan Tenant', 'Sam Tenant']);
  assert.match(lease.terms.authorizedOccupants, /Emma Tenant \(biological child of Jordan Tenant\)/);
  assert.equal(lease.terms.coTenants?.length, 1);
  assert.equal(lease.terms.coTenants?.[0]?.personId, coTenants[0].personId);

  const people = await store.listPeople();
  assert.equal(people.length, 2);
  const sam = people.find((row) => row.emailKey === 'sam@example.com');
  assert.ok(sam);
});

test('phone-only co-tenant gets synthetic email key', async () => {
  const store = resetStoreForTests();
  const person = await store.upsertPerson({ displayName: 'Riley Tenant', phone: '(678) 885-7368' });
  assert.equal(person.emailKey, 'phone:6788857368');
  assert.equal(person.email, '');
});
