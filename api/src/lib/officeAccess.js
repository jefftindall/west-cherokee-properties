import {
  getClientPrincipal,
  identityCandidates,
  isLocalDev,
  parseAllowlist,
  primaryEmail,
} from './auth.js';
import { ROLE, hasPermission, resolvePermissions } from './permissions.js';
import { getStore } from './store.js';

export class OfficeUnauthorizedError extends Error {
  constructor(message = 'Sign in to use the office.') {
    super(message);
    this.name = 'OfficeUnauthorizedError';
  }
}

export class OfficeForbiddenError extends Error {
  constructor(message = 'This account is signed in but cannot use the office.') {
    super(message);
    this.name = 'OfficeForbiddenError';
  }
}

export class PortalUnauthorizedError extends Error {
  constructor(message = 'Sign in to use the resident portal.') {
    super(message);
    this.name = 'PortalUnauthorizedError';
  }
}

function matchesProfile(profile, candidates) {
  const keys = [
    String(profile.userId || '').toLowerCase(),
    String(profile.userDetails || '').toLowerCase(),
    ...(Array.isArray(profile.emails) ? profile.emails.map((e) => String(e).toLowerCase()) : []),
  ].filter(Boolean);
  return keys.some((key) => candidates.includes(key));
}

export async function officeCaller(request, env = process.env) {
  if (isLocalDev(env)) {
    return {
      principal: { userId: 'dev-user', userDetails: 'dev@local', identityProvider: 'aad' },
      email: 'dev@local',
      permissions: resolvePermissions({ roles: [ROLE.SUPER_ADMINISTRATOR] }),
      profile: { id: 'local-dev', roles: [ROLE.SUPER_ADMINISTRATOR], status: 'active' },
    };
  }

  const principal = getClientPrincipal(request);
  if (!principal) throw new OfficeUnauthorizedError();

  const store = getStore();
  const candidates = identityCandidates(principal);
  const allow = parseAllowlist(env);
  let profile = (await store.listOfficeUsers()).find((row) => matchesProfile(row, candidates));

  if (!profile && allow.some((id) => candidates.includes(id))) {
    profile = await store.upsertOfficeUser({
      userId: principal.userId,
      userDetails: principal.userDetails,
      emails: [primaryEmail(principal)].filter(Boolean),
      roles: [ROLE.SUPER_ADMINISTRATOR],
      status: 'active',
    });
  }

  if (!profile || profile.status === 'disabled') {
    throw new OfficeForbiddenError();
  }

  return {
    principal,
    email: primaryEmail(principal),
    permissions: resolvePermissions(profile),
    profile,
  };
}

export async function permissionGate(request, permission, env = process.env) {
  const caller = await officeCaller(request, env);
  if (!hasPermission(caller.permissions, permission)) {
    throw new OfficeForbiddenError();
  }
  return caller;
}

export function portalCaller(request, env = process.env) {
  if (isLocalDev(env)) {
    return {
      principal: { userId: 'dev-renter', userDetails: 'renter@local', identityProvider: 'externalid' },
      email: 'renter@local',
    };
  }
  const principal = getClientPrincipal(request);
  if (!principal) throw new PortalUnauthorizedError();
  const email = primaryEmail(principal);
  if (!email) throw new PortalUnauthorizedError('This sign-in has no email we can match to a renter.');
  return { principal, email };
}
