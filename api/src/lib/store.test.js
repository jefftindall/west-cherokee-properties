import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import { approveApplication } from './applications.js';

test('memory store seeds three properties and five units', async () => {
  const store = createMemoryStore();
  const properties = await store.listProperties();
  assert.equal(properties.length, 3);
  const units = await store.listUnits();
  assert.equal(units.length, 5);
  const cherokeeB = units.find((u) => u.id === 'unit-124-w-cherokee-b');
  assert.equal(cherokeeB?.bedrooms, 3);
  assert.equal(cherokeeB?.bathrooms, 2);
});

test('approve application creates a person and a lease on a vacant unit', async () => {
  const store = createMemoryStore();
  const application = await store.createApplication({
    propertySlug: '124-w-cherokee',
    fullName: 'Jordan Tenant',
    email: 'jordan@example.com',
    phone: '4045550100',
    desiredMoveIn: '2026-09-01',
    householdSize: 2,
  });
  const result = await approveApplication(store, application.id, {
    unitId: 'unit-124-w-cherokee-a',
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 145000,
  });
  assert.equal(result.application.status, 'approved');
  assert.equal(result.person.emailKey, 'jordan@example.com');
  assert.equal(result.lease.unitId, 'unit-124-w-cherokee-a');
  assert.equal(result.lease.terms.petCount, 0);
  assert.equal(result.lease.terms.maxOccupants, 2);
  await assert.rejects(
    () =>
      store.createLease({
        unitId: 'unit-124-w-cherokee-a',
        personId: result.person.id,
        startDate: '2026-10-01',
        endDate: '2027-09-30',
        rentCents: 150000,
      }),
    /already has an active lease/,
  );
});

test('updateLease merges pet terms without dropping occupants', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan Tenant', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-11-noble',
    personId: person.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 90000,
    terms: { tenantNames: 'Jordan Tenant', authorizedOccupants: 'Jordan Tenant', petCount: 0 },
  });
  const updated = await store.updateLease(lease.id, { terms: { petCount: 1, approvedPets: 'One cat' } });
  assert.equal(updated.terms.petCount, 1);
  assert.equal(updated.terms.approvedPets, 'One cat');
  assert.deepEqual(updated.terms.tenantNames, ['Jordan Tenant']);
});

test('updatePerson changes display name and phone', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan Tenant', email: 'jordan@example.com', phone: '4045550100' });
  const updated = await store.updatePerson(person.id, { displayName: 'Jordan T.', phone: '4045550199' });
  assert.equal(updated.displayName, 'Jordan T.');
  assert.equal(updated.phone, '4045550199');
  assert.equal(updated.emailKey, 'jordan@example.com');
});

test('updatePerson rejects duplicate email', async () => {
  const store = createMemoryStore();
  const jordan = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  await store.upsertPerson({ displayName: 'Riley', email: 'riley@example.com' });
  await assert.rejects(
    () => store.updatePerson(jordan.id, { email: 'riley@example.com' }),
    /already uses that email/,
  );
});
