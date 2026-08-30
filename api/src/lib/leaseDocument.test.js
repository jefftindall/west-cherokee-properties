import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import { buildLeaseDocument, fillLeaseTemplate, loadLeaseTemplate } from './leaseDocument.js';
import { monthlyChargeCents, UNIT_LEASE_DEFAULTS } from './leaseTerms.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

test('runtime lease template matches docs/legal', () => {
  const docs = readFileSync(join(repoRoot, 'docs/legal/georgia-residential-lease-template.md'), 'utf8');
  assert.equal(loadLeaseTemplate(), docs);
});

test('11 Noble defaults include laundry storage and Southern States Bank', () => {
  const noble = UNIT_LEASE_DEFAULTS['unit-11-noble'];
  assert.match(noble.storageTerms, /laundry room beneath the unit/);
  assert.match(noble.parkingDescription, /beside the apartment/);
  assert.equal(noble.maxOccupants, 3);
  assert.match(noble.tenantMaintenance, /Landlord maintains/);
});

test('pet rent is $20 per pet and is added to the monthly charge', () => {
  assert.equal(monthlyChargeCents(157500, 2), 161500);
});

test('filled lease names Southern States Bank and allows pets', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'Jordan Tenant', email: 'jordan@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-11-noble',
    personId: person.id,
    startDate: '2026-09-01',
    endDate: '2027-08-31',
    rentCents: 90000,
    terms: {
      tenantNames: 'Jordan Tenant',
      petCount: 1,
      approvedPets: 'One cat',
      securityDepositCents: 90000,
    },
  });
  const document = buildLeaseDocument({ lease, person });
  assert.match(document.html, /Southern States Bank/);
  assert.doesNotMatch(document.html, /FirstBank/);
  assert.doesNotMatch(document.html, /Century Bank/);
  assert.match(document.html, /\$20\.00 per approved pet/);
  assert.match(document.html, /One cat/);
  assert.match(document.html, /laundry room beneath the unit/);
  assert.match(document.filename, /11-noble/);
  const filled = fillLeaseTemplate(document.fields);
  assert.doesNotMatch(filled, /\{\{[a-z0-9_]+\}\}/);
});
