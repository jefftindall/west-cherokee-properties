import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createMemoryStore } from './store.js';
import { fillTemplate, loadTemplate } from './legalDocument.js';
import {
  buildAffidavitOfServiceDocument,
  buildEvictionNoticeDocument,
} from './legalDocuments.js';
import { computeOpenBalanceCents } from './legalTerms.js';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '../../..');

test('runtime eviction notice template matches docs/legal', () => {
  const docs = readFileSync(join(repoRoot, 'docs/legal/georgia-eviction-notice-template.md'), 'utf8');
  assert.equal(loadTemplate('georgia-eviction-notice-template.md'), docs);
});

test('runtime affidavit template matches docs/legal', () => {
  const docs = readFileSync(join(repoRoot, 'docs/legal/georgia-affidavit-of-service-template.md'), 'utf8');
  assert.equal(loadTemplate('georgia-affidavit-of-service-template.md'), docs);
});

test('computeOpenBalanceCents sums unpaid invoices for a lease', () => {
  const invoices = [
    { leaseId: 'lease-a', status: 'open', amountCents: 90000 },
    { leaseId: 'lease-a', status: 'paid', amountCents: 5000 },
    { leaseId: 'lease-b', status: 'open', amountCents: 10000 },
  ];
  assert.equal(computeOpenBalanceCents('lease-a', invoices), 90000);
});

test('eviction notice fills tenant, premises, and seven-day language', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'L. Elizabeth Blair', email: 'tenant@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-10-falcon-b',
    personId: person.id,
    startDate: '2020-09-01',
    endDate: '2021-08-31',
    rentCents: 89500,
    terms: { tenantNames: 'L. Elizabeth Blair', securityDepositCents: 89500 },
  });
  const invoices = [
    {
      leaseId: lease.id,
      status: 'open',
      amountCents: 179000,
      periodStart: '2022-04-01',
      periodEnd: '2022-04-30',
    },
  ];
  const document = buildEvictionNoticeDocument({
    lease,
    person,
    invoices,
    options: { noticeDate: '2022-05-04' },
  });
  assert.match(document.html, /NOTICE TO PAY RENT OR QUIT/);
  assert.match(document.html, /L\. Elizabeth Blair/);
  assert.match(document.html, /10 B Falcon Circle/);
  assert.match(document.html, /\$1790\.00/);
  assert.match(document.html, /SEVEN \(7\) days/);
  assert.match(document.html, /West Cherokee Properties/);
  assert.match(document.filename, /eviction-notice/);
  assert.doesNotMatch(fillTemplate(document.fields, loadTemplate('georgia-eviction-notice-template.md')), /\{\{[a-z0-9_]+\}\}/);
});

test('affidavit of service fills recipient and server blocks', async () => {
  const store = createMemoryStore();
  const person = await store.upsertPerson({ displayName: 'L. Elizabeth Blair', email: 'tenant@example.com' });
  const lease = await store.createLease({
    unitId: 'unit-10-falcon-b',
    personId: person.id,
    startDate: '2020-09-01',
    endDate: '2021-08-31',
    rentCents: 89500,
    terms: { tenantNames: 'L. Elizabeth Blair', securityDepositCents: 89500 },
  });
  const document = buildAffidavitOfServiceDocument({
    lease,
    person,
    options: { serviceDate: '2022-05-04', serverName: 'WEST CHEROKEE PROPERTIES, LLC' },
  });
  assert.match(document.html, /AFFIDAVIT OF SERVICE BY PERSONAL SERVICE/);
  assert.match(document.html, /L\. ELIZABETH BLAIR/);
  assert.match(document.html, /10 B FALCON CIRCLE/);
  assert.match(document.html, /NOTICE TO PAY RENT OR QUIT/);
  assert.match(document.html, /disinterested third party/);
  assert.match(document.filename, /affidavit-of-service/);
  assert.doesNotMatch(
    fillTemplate(document.fields, loadTemplate('georgia-affidavit-of-service-template.md')),
    /\{\{[a-z0-9_]+\}\}/,
  );
});
