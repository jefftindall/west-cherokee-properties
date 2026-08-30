import assert from 'node:assert/strict';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import { propertyAcceptsApplications } from './availability.js';

test('no property accepts applications while every unit is unavailable in SQL', async () => {
  const store = createMemoryStore();
  assert.equal(await propertyAcceptsApplications(store, '124-w-cherokee'), false);
  assert.equal(await propertyAcceptsApplications(store, '11-noble'), false);
  assert.equal(await propertyAcceptsApplications(store, '10-falcon-circle'), false);
  assert.equal(await propertyAcceptsApplications(store, 'unknown'), false);
});

test('property accepts applications when a unit is marked available', async () => {
  const store = createMemoryStore();
  await store.updateUnit('unit-124-w-cherokee-a', { available: true });
  assert.equal(await propertyAcceptsApplications(store, '124-w-cherokee'), true);
  assert.equal(await propertyAcceptsApplications(store, '11-noble'), false);
});
