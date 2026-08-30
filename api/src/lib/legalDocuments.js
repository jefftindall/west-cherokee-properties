import {
  assembleAffidavitOfServiceFields,
  assembleEvictionNoticeFields,
  legalDocumentFilename,
} from './legalTerms.js';
import { buildFilledDocument } from './legalDocument.js';
import { UNIT_LEASE_DEFAULTS } from './leaseTerms.js';

const EVICTION_TEMPLATE = 'georgia-eviction-notice-template.md';
const AFFIDAVIT_TEMPLATE = 'georgia-affidavit-of-service-template.md';

function parseDocumentOptions(searchParams) {
  const get = (key) => searchParams.get(key) || undefined;
  const cents = get('amountDueCents');
  return {
    noticeDate: get('noticeDate'),
    periodStart: get('periodStart'),
    periodEnd: get('periodEnd'),
    amountDueCents: cents != null && cents !== '' ? Number(cents) : undefined,
    possessionDeliverTo: get('possessionDeliverTo'),
    landlordSignerName: get('landlordSignerName'),
    serviceDate: get('serviceDate'),
    serverName: get('serverName'),
    documentServed: get('documentServed'),
    affidavitSignDay: get('affidavitSignDay'),
    affidavitSignMonth: get('affidavitSignMonth'),
    affidavitSignYear: get('affidavitSignYear'),
    notaryCounty: get('notaryCounty'),
    notaryDay: get('notaryDay'),
    notaryMonth: get('notaryMonth'),
    notaryYear: get('notaryYear'),
    notaryName: get('notaryName'),
    notaryTitle: get('notaryTitle'),
    notaryCommissionExpires: get('notaryCommissionExpires'),
  };
}

export function buildEvictionNoticeDocument({ lease, person, invoices, options = {} } = {}) {
  const fields = assembleEvictionNoticeFields({ lease, person, invoices, options });
  const { html, filled } = buildFilledDocument({
    templateFilename: EVICTION_TEMPLATE,
    fields,
    title: 'Notice to Pay Rent or Quit',
  });
  const unit = UNIT_LEASE_DEFAULTS[lease?.unitId] || {};
  return {
    fields,
    html,
    filled,
    filename: legalDocumentFilename('eviction-notice', lease, unit, options.noticeDate),
  };
}

export function buildAffidavitOfServiceDocument({ lease, person, options = {} } = {}) {
  const fields = assembleAffidavitOfServiceFields({ lease, person, options });
  const { html, filled } = buildFilledDocument({
    templateFilename: AFFIDAVIT_TEMPLATE,
    fields,
    title: 'Affidavit of Service by Personal Service',
  });
  const unit = UNIT_LEASE_DEFAULTS[lease?.unitId] || {};
  return {
    fields,
    html,
    filled,
    filename: legalDocumentFilename('affidavit-of-service', lease, unit, options.serviceDate),
  };
}

export function buildLegalDocument({ type, lease, person, invoices, searchParams }) {
  const options = parseDocumentOptions(searchParams);
  if (type === 'eviction-notice') {
    return buildEvictionNoticeDocument({ lease, person, invoices, options });
  }
  if (type === 'affidavit-of-service') {
    return buildAffidavitOfServiceDocument({ lease, person, options });
  }
  const err = new Error('Unknown legal document type.');
  err.name = 'ValidationError';
  throw err;
}

export { parseDocumentOptions };
