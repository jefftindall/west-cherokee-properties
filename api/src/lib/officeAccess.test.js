import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionGate, portalCaller } from './officeAccess.js';
import { PERMISSION } from './permissions.js';
import { createMemoryStore, resetStoreForTests } from './store.js';

test('local development grants the full office catalog', async () => {
  resetStoreForTests(createMemoryStore());
  const env = { AZURE_FUNCTIONS_ENVIRONMENT: 'Development' };
  const caller = await permissionGate({ headers: new Headers() }, PERMISSION.USERS_MANAGE, env);
  assert.equal(caller.email, 'dev@local');
});

test('portalCaller in development uses the renter email', () => {
  const caller = portalCaller({ headers: new Headers() }, { AZURE_FUNCTIONS_ENVIRONMENT: 'Development' });
  assert.equal(caller.email, 'renter@local');
});
