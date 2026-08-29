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
