import assert from 'node:assert/strict';
import test from 'node:test';
import { getClientPrincipal, identityCandidates, primaryEmail } from './auth.js';

test('getClientPrincipal decodes the SWA header', () => {
  const principal = { userId: 'abc', userDetails: 'staff@wcp.test', identityProvider: 'aad' };
  const header = Buffer.from(JSON.stringify(principal), 'utf8').toString('base64');
  const request = { headers: new Headers({ 'x-ms-client-principal': header }) };
  assert.deepEqual(getClientPrincipal(request), principal);
});

test('identityCandidates includes email claims', () => {
  const candidates = identityCandidates({
    userId: 'oid-1',
    userDetails: 'Ada',
    identityProvider: 'externalid',
    claims: [{ typ: 'email', val: 'renter@wcp.test' }],
  });
  assert.ok(candidates.includes('renter@wcp.test'));
  assert.equal(primaryEmail({
    userId: 'oid-1',
    claims: [{ typ: 'email', val: 'renter@wcp.test' }],
  }), 'renter@wcp.test');
});
