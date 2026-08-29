import { randomUUID } from 'node:crypto';

const EMAIL_CLAIM_TYPES = new Set([
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'emails',
  'email',
]);

export function getClientPrincipal(request) {
  const header = request.headers.get('x-ms-client-principal');
  if (!header) return null;
  try {
    const decoded = Buffer.from(header, 'base64').toString('utf8');
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

export function newCorrelationId() {
  return randomUUID();
}

export function identityCandidates(principal) {
  if (!principal) return [];
  const userId = String(principal.userId || '').toLowerCase();
  const claims = Array.isArray(principal.claims) ? principal.claims : [];
  const emails = claims
    .filter((c) => EMAIL_CLAIM_TYPES.has(c.typ))
    .map((c) => String(c.val || '').toLowerCase());
  const identityProvider = String(principal.identityProvider || '').toLowerCase();
  const userDetails = String(principal.userDetails || '').toLowerCase();
  const seen = new Set();
  const out = [];
  for (const value of [userId, userDetails, ...emails, `${identityProvider}:${userId}`]) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

export function primaryEmail(principal) {
  const candidates = identityCandidates(principal);
  return candidates.find((value) => value.includes('@')) || '';
}

export function parseAllowlist(env = process.env) {
  return String(env.ALLOWED_USER_IDS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isLocalDev(env = process.env) {
  return String(env.AZURE_FUNCTIONS_ENVIRONMENT || '') === 'Development';
}

export function isExternalIdProvider(principal) {
  const idp = String(principal?.identityProvider || '').toLowerCase();
  return idp === 'externalid' || idp.includes('external');
}

export function isWorkforceProvider(principal) {
  const idp = String(principal?.identityProvider || '').toLowerCase();
  return idp === 'aad' || idp === 'azureactivedirectory' || idp === '';
}
