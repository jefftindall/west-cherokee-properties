import assert from 'node:assert/strict';
import test from 'node:test';
import { PERMISSION, ROLE, hasPermission, resolvePermissions } from './permissions.js';

test('super administrator receives the full catalog', () => {
  const perms = resolvePermissions({ roles: [ROLE.SUPER_ADMINISTRATOR] });
  assert.ok(hasPermission(perms, PERMISSION.USERS_MANAGE));
  assert.ok(hasPermission(perms, PERMISSION.LEASES_WRITE));
});

test('write implies read and denied permissions win', () => {
  const perms = resolvePermissions({
    roles: [ROLE.PROPERTY_MANAGER],
    deniedPermissions: [PERMISSION.INVOICES_WRITE],
  });
  assert.equal(hasPermission(perms, PERMISSION.INVOICES_WRITE), false);
  assert.ok(hasPermission(perms, PERMISSION.INVOICES_READ));
  assert.ok(hasPermission(perms, PERMISSION.LEASES_READ));
});

test('maintenance cannot manage leases', () => {
  const perms = resolvePermissions({ roles: [ROLE.MAINTENANCE] });
  assert.equal(hasPermission(perms, PERMISSION.LEASES_WRITE), false);
  assert.ok(hasPermission(perms, PERMISSION.REQUESTS_WRITE));
});
