export const PERMISSION = {
  APPLICATIONS_READ: 'applications.read',
  APPLICATIONS_WRITE: 'applications.write',
  PEOPLE_READ: 'people.read',
  PEOPLE_WRITE: 'people.write',
  LEASES_READ: 'leases.read',
  LEASES_WRITE: 'leases.write',
  INVOICES_READ: 'invoices.read',
  INVOICES_WRITE: 'invoices.write',
  REQUESTS_READ: 'requests.read',
  REQUESTS_WRITE: 'requests.write',
  USERS_READ: 'users.read',
  USERS_MANAGE: 'users.manage',
};

export const PERMISSION_IMPLIES = {
  [PERMISSION.APPLICATIONS_WRITE]: [PERMISSION.APPLICATIONS_READ],
  [PERMISSION.PEOPLE_WRITE]: [PERMISSION.PEOPLE_READ],
  [PERMISSION.LEASES_WRITE]: [PERMISSION.LEASES_READ],
  [PERMISSION.INVOICES_WRITE]: [PERMISSION.INVOICES_READ],
  [PERMISSION.REQUESTS_WRITE]: [PERMISSION.REQUESTS_READ],
  [PERMISSION.USERS_MANAGE]: [PERMISSION.USERS_READ],
};

export const PERMISSION_CATALOG = Object.fromEntries(
  Object.values(PERMISSION).map((id) => [
    id,
    {
      id,
      label: id,
      description: id,
    },
  ]),
);

export const ROLE = {
  SUPER_ADMINISTRATOR: 'super_administrator',
  PROPERTY_MANAGER: 'property_manager',
  MAINTENANCE: 'maintenance',
};

export const ROLE_CATALOG = {
  [ROLE.SUPER_ADMINISTRATOR]: {
    id: ROLE.SUPER_ADMINISTRATOR,
    label: 'Super Administrator',
    description: 'Full office access. Not an Azure Owner role.',
    permissions: Object.keys(PERMISSION_CATALOG),
  },
  [ROLE.PROPERTY_MANAGER]: {
    id: ROLE.PROPERTY_MANAGER,
    label: 'Property manager',
    description: 'Applications, people, leases, invoices, and requests. Not access management.',
    permissions: [
      PERMISSION.APPLICATIONS_READ,
      PERMISSION.APPLICATIONS_WRITE,
      PERMISSION.PEOPLE_READ,
      PERMISSION.PEOPLE_WRITE,
      PERMISSION.LEASES_READ,
      PERMISSION.LEASES_WRITE,
      PERMISSION.INVOICES_READ,
      PERMISSION.INVOICES_WRITE,
      PERMISSION.REQUESTS_READ,
      PERMISSION.REQUESTS_WRITE,
    ],
  },
  [ROLE.MAINTENANCE]: {
    id: ROLE.MAINTENANCE,
    label: 'Maintenance',
    description: 'Service request queue only.',
    permissions: [PERMISSION.REQUESTS_READ, PERMISSION.REQUESTS_WRITE],
  },
};

export function isKnownPermission(id) {
  return Object.prototype.hasOwnProperty.call(PERMISSION_CATALOG, String(id || ''));
}

export function isKnownRole(id) {
  return Object.prototype.hasOwnProperty.call(ROLE_CATALOG, String(id || '').trim().toLowerCase());
}

function uniqueStrings(values) {
  const seen = new Set();
  const out = [];
  for (const raw of Array.isArray(values) ? values : []) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function expandImplied(permissionSet) {
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of [...permissionSet]) {
      for (const extra of PERMISSION_IMPLIES[id] || []) {
        if (!permissionSet.has(extra)) {
          permissionSet.add(extra);
          changed = true;
        }
      }
    }
  }
}

export function resolvePermissions(grant = {}) {
  const permissionSet = new Set();
  for (const roleId of uniqueStrings(grant.roles)) {
    const role = ROLE_CATALOG[roleId];
    if (!role) continue;
    for (const id of role.permissions) permissionSet.add(id);
  }
  for (const id of uniqueStrings(grant.extraPermissions)) {
    if (isKnownPermission(id)) permissionSet.add(id);
  }
  expandImplied(permissionSet);
  for (const id of uniqueStrings(grant.deniedPermissions)) {
    permissionSet.delete(id);
  }
  return [...permissionSet].sort();
}

export function hasPermission(permissions, permission) {
  const id = String(permission || '').trim();
  if (!id) return false;
  return Array.isArray(permissions) && permissions.includes(id);
}
