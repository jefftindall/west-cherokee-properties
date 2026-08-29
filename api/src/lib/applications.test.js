import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeApplication } from './applications.js';

test('normalizeApplication rejects missing email', () => {
  assert.throws(
    () => normalizeApplication({ fullName: 'A', propertySlug: '124-w-cherokee', householdSize: 1 }),
    /email/,
  );
});
