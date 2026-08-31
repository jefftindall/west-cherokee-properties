/** Merge fields for Georgia eviction notices and affidavits of service. */

import { formatMoney, UNIT_LEASE_DEFAULTS } from './leaseTerms.js';

export const WCP_LANDLORD = {
  legalName: 'WEST CHEROKEE PROPERTIES, LLC',
  noticeName: 'West Cherokee Properties',
  noticeAddress: '227 W Cherokee Ave, Cartersville, Georgia 30120-3003',
  noticeCity: 'Cartersville',
  noticeState: 'Georgia',
  noticeZip: '30120',
  phone: '678-885-7368',
  email: 'info@westcherokee.com',
  defaultServerName: 'WEST CHEROKEE PROPERTIES, LLC',
};

function asNameList(value) {
  if (Array.isArray(value)) {
    return value.map((name) => String(name || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function formatLegalDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function tenantNamesFromLease({ lease, person } = {}) {
  const fromTerms = asNameList(lease?.terms?.tenantNames);
  if (fromTerms.length) return fromTerms;
  const name = String(person?.displayName || '').trim();
  return name ? [name] : [];
}

export function computeOpenBalanceCents(leaseId, invoices = []) {
  return (invoices || [])
    .filter((invoice) => invoice.leaseId === leaseId && invoice.status !== 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.amountCents || 0), 0);
}

export function oldestUnpaidPeriod(invoices = [], leaseId) {
  const open = (invoices || [])
    .filter((invoice) => invoice.leaseId === leaseId && invoice.status !== 'paid')
    .sort((a, b) => String(a.periodStart).localeCompare(String(b.periodStart)));
  if (!open.length) return { periodStart: '', periodEnd: '' };
  return { periodStart: open[0].periodStart, periodEnd: open[open.length - 1].periodEnd };
}

function addressSlug(lease, unit) {
  return (unit?.premisesAddress || lease?.unitId || 'document')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function legalDocumentFilename(prefix, lease, unit, date = new Date()) {
  const address = addressSlug(lease, unit);
  const stamp = String(date).slice(0, 10);
  return `wcp-${prefix}-${address}-${stamp}.html`;
}

export function assembleEvictionNoticeFields({ lease, person, invoices, options = {} } = {}) {
  const unit = UNIT_LEASE_DEFAULTS[lease?.unitId] || {};
  const names = tenantNamesFromLease({ lease, person });
  const primaryName = names[0] || '';
  const premisesAddress = unit.premisesAddress || '';
  const openBalance = computeOpenBalanceCents(lease?.id, invoices);
  const defaultPeriod = oldestUnpaidPeriod(invoices, lease?.id);
  const amountCents =
    options.amountDueCents != null && options.amountDueCents !== ''
      ? Number(options.amountDueCents)
      : openBalance || Number(lease?.rentCents || 0);
  const periodStart = options.periodStart || defaultPeriod.periodStart || '';
  const periodEnd = options.periodEnd || defaultPeriod.periodEnd || '';
  const noticeDate = options.noticeDate || new Date().toISOString().slice(0, 10);

  return {
    notice_date: formatLegalDate(noticeDate),
    tenant_name: primaryName,
    tenant_mailing_address: premisesAddress,
    premises_address: premisesAddress,
    lease_date: formatLegalDate(lease?.startDate),
    amount_due: formatMoney(amountCents),
    period_start: periodStart ? formatLegalDate(periodStart) : '_________________',
    period_end: periodEnd ? formatLegalDate(periodEnd) : '_________________',
    possession_deliver_to: options.possessionDeliverTo || '_________________',
    landlord_signer_name: options.landlordSignerName || '',
    landlord_name: WCP_LANDLORD.noticeName,
    landlord_address: WCP_LANDLORD.noticeAddress,
  };
}

export function assembleAffidavitOfServiceFields({ lease, person, options = {} } = {}) {
  const unit = UNIT_LEASE_DEFAULTS[lease?.unitId] || {};
  const names = tenantNamesFromLease({ lease, person });
  const primaryName = (names[0] || '').toUpperCase();
  const premisesAddress = (unit.premisesAddress || '').toUpperCase();
  const serviceDate = options.serviceDate || new Date().toISOString().slice(0, 10);
  const serverName = options.serverName || WCP_LANDLORD.defaultServerName;

  return {
    server_name: serverName,
    service_date: formatLegalDate(serviceDate),
    document_served: options.documentServed || 'NOTICE TO PAY RENT OR QUIT',
    recipient_name: primaryName,
    recipient_address: premisesAddress,
    affidavit_sign_day: options.affidavitSignDay || '____________',
    affidavit_sign_month: options.affidavitSignMonth || '_________________________',
    affidavit_sign_year: options.affidavitSignYear || '____',
    service_city: WCP_LANDLORD.noticeCity.toUpperCase(),
    service_state: WCP_LANDLORD.noticeState,
    notary_county: options.notaryCounty || '_______________',
    notary_day: options.notaryDay || '_____',
    notary_month: options.notaryMonth || '____________________',
    notary_year: options.notaryYear || '_____',
    notary_name: options.notaryName || '________________________________',
    notary_title: options.notaryTitle || '_________________________________',
    notary_commission_expires: options.notaryCommissionExpires || '_____________',
  };
}
