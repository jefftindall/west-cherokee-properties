import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import { requestOwnedByPerson } from './serviceRequests.js';

test('service requests are scoped to the creating person', async () => {
  const store = createMemoryStore();
  const jordan = await store.upsertPerson({ displayName: 'Jordan', email: 'jordan@example.com' });
  const riley = await store.upsertPerson({ displayName: 'Riley', email: 'riley@example.com' });
  const request = await store.createServiceRequest({
    personId: jordan.id,
    unitId: 'unit-124-w-cherokee-a',
    title: 'Leaky faucet',
    details: 'Kitchen sink drips',
  });
  assert.equal(requestOwnedByPerson(request, jordan.id), true);
  assert.equal(requestOwnedByPerson(request, riley.id), false);
});
