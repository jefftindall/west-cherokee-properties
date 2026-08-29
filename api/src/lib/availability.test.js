import assert from 'node:assert/strict';
import test from 'node:test';
import { propertyAcceptsApplications } from './availability.js';

test('no seeded property accepts applications while every unit is leased', () => {
  assert.equal(propertyAcceptsApplications('124-w-cherokee'), false);
  assert.equal(propertyAcceptsApplications('11-noble'), false);
  assert.equal(propertyAcceptsApplications('10-falcon-circle'), false);
  assert.equal(propertyAcceptsApplications('unknown'), false);
});
