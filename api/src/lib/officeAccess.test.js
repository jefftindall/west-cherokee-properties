import assert from 'node:assert/strict';
import test from 'node:test';
import { officeCaller, permissionGate, portalCaller } from './officeAccess.js';
import { PERMISSION } from './permissions.js';
import { createMemoryStore, resetStoreForTests } from './store.js';

function principalHeader(principal) {
  const encoded = Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');
  return new Headers({ 'x-ms-client-principal': encoded });
}

test('local development grants the full office catalog', async () => {
  resetStoreForTests(createMemoryStore());
  const env = { AZURE_FUNCTIONS_ENVIRONMENT: 'Development' };
  const caller = await permissionGate({ headers: new Headers() }, PERMISSION.USERS_MANAGE, env);
  assert.equal(caller.email, 'dev@local');
});

test('production rejects office APIs without a client principal', async () => {
  resetStoreForTests(createMemoryStore());
  const env = { AZURE_FUNCTIONS_ENVIRONMENT: 'Production' };
  await assert.rejects(
    () => permissionGate({ headers: new Headers() }, PERMISSION.LEASES_READ, env),
    /Sign in to use the office/,
  );
});

test('production rejects resident portal sign-in for office APIs', async () => {
  resetStoreForTests(createMemoryStore());
  const env = { AZURE_FUNCTIONS_ENVIRONMENT: 'Production' };
  await assert.rejects(
    () =>
      permissionGate(
        {
          headers: principalHeader({
            userId: 'renter-1',
            userDetails: 'renter@example.com',
            identityProvider: 'externalid',
            claims: [{ typ: 'email', val: 'renter@example.com' }],
          }),
        },
        PERMISSION.LEASES_READ,
        env,
      ),
    /Staff sign-in is required for the office/,
  );
});

test('production allows workforce staff on the allowlist', async () => {
  resetStoreForTests(createMemoryStore());
  const env = {
    AZURE_FUNCTIONS_ENVIRONMENT: 'Production',
    ALLOWED_USER_IDS: 'staff@wcp.test',
  };
  const caller = await officeCaller(
    {
      headers: principalHeader({
        userId: 'staff-1',
        userDetails: 'staff@wcp.test',
        identityProvider: 'aad',
        claims: [{ typ: 'email', val: 'staff@wcp.test' }],
      }),
    },
    env,
  );
  assert.equal(caller.email, 'staff@wcp.test');
});

test('portalCaller in development uses the renter email', () => {
  const caller = portalCaller({ headers: new Headers() }, { AZURE_FUNCTIONS_ENVIRONMENT: 'Development' });
  assert.equal(caller.email, 'renter@local');
});
