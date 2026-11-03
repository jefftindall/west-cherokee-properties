import { sendTenantEmail } from './acsNotify.js';
import { ensureInvoiceForLeasePeriod, findInvoiceForPeriod } from './payments.js';
import { nyTodayIso } from './rentBilling.js';
import { buildCommunicationMessage, portalPayUrl } from './rentCommunications.js';
import {
  rentCommunicationsEnabled,
  rentCommunicationsPreview,
} from './stripeWebhook.js';
import { billingMonthsThroughLease, computeBalanceDue, openInvoicesForLease } from './unitDetail.js';
import { monthLabel } from './unitHealth.js';

/**
 * Create missing invoices for active leases through the current month.
 * Catch-up charges are late-fee exempt and get an apologetic notice.
 */
export async function runInvoiceCatchUp(
  store,
  {
    leaseId = null,
    dryRun = false,
    env = process.env,
    now = new Date(),
  } = {},
) {
  const [leases, invoices, people] = await Promise.all([
    store.listLeases(),
    store.listInvoices(),
    store.listPeople(),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const active = leases.filter((lease) => {
    if (lease.status !== 'active') return false;
    if (leaseId && lease.id !== leaseId) return false;
    return true;
  });

  if (leaseId && !active.length) {
    const known = leases.some((row) => row.id === leaseId);
    const err = new Error(known ? 'Lease is not active.' : 'Lease not found.');
    err.name = known ? 'ValidationError' : 'NotFoundError';
    throw err;
  }

  const today = nyTodayIso(now);
  const leaseResults = [];
  let created = 0;
  let emailed = 0;
  const errors = [];

  const enabled = rentCommunicationsEnabled(env);
  const preview = rentCommunicationsPreview(env);
  const canEmail = enabled || preview;

  for (const lease of active) {
    const periods = billingMonthsThroughLease(lease, now);
    const missing = [];
    for (const period of periods) {
      const existing = findInvoiceForPeriod(
        invoices,
        lease.id,
        period.billingPeriodStart,
        period.billingPeriodEnd,
      );
      if (existing) continue;
      missing.push({
        periodStart: period.billingPeriodStart,
        periodEnd: period.billingPeriodEnd,
        label: monthLabel(period.billingPeriodStart),
      });
    }

    const person = peopleById.get(lease.personId) || null;
    const createdInvoices = [];

    if (!dryRun) {
      for (const period of missing) {
        try {
          const invoice = await ensureInvoiceForLeasePeriod(
            store,
            lease,
            period.periodStart,
            period.periodEnd,
            { billingSource: 'catchup' },
          );
          invoices.push(invoice);
          createdInvoices.push(invoice);
          created += 1;
        } catch (err) {
          errors.push({
            leaseId: lease.id,
            periodStart: period.periodStart,
            error: err instanceof Error ? err.message : 'unknown',
          });
        }
      }
    }

    let email = { skipped: true, reason: 'no_missing_periods' };
    if (missing.length === 0) {
      email = { skipped: true, reason: 'no_missing_periods' };
    } else if (dryRun) {
      email = { skipped: true, reason: 'dry_run', wouldSend: Boolean(person?.email && canEmail) };
    } else if (!createdInvoices.length) {
      email = { skipped: true, reason: 'nothing_created' };
    } else if (!canEmail) {
      email = { skipped: true, reason: 'communications_disabled' };
    } else if (!person?.email) {
      email = { skipped: true, reason: 'no_tenant_email' };
    } else {
      const existingLog = await store.getCommunicationLogForLeaseDate(lease.id, today);
      if (existingLog) {
        email = { skipped: true, reason: 'already_sent_today' };
      } else {
        try {
          const balanceDueCents = computeBalanceDue(lease, invoices);
          const content = buildCommunicationMessage({
            messageType: 'invoice_catchup_notice',
            person,
            period: { periodStart: createdInvoices[0].periodStart },
            amountCents: balanceDueCents,
            payUrl: portalPayUrl(env),
            catchupMonths: createdInvoices.map((row) => row.periodStart),
          });
          await sendTenantEmail({
            to: person.email,
            subject: content.subject,
            plainText: content.plainText,
            preview,
          });
          await store.createCommunicationLog({
            leaseId: lease.id,
            messageType: 'invoice_catchup_notice',
            sentDate: today,
            recipientEmail: preview ? String(env.CONTACT_NOTIFY_EMAIL || person.email) : person.email,
            preview,
            periodStart: createdInvoices[0].periodStart,
          });
          await store.upsertTenantCommunicationState(lease.id, {
            lastSentDate: today,
            lastMessageType: 'invoice_catchup_notice',
          });
          emailed += 1;
          email = { skipped: false, sent: true, preview, subject: content.subject };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'unknown';
          email = { skipped: true, reason: 'send_failed', error: message };
          errors.push({ leaseId: lease.id, error: message });
        }
      }
    }

    const openInvoices = openInvoicesForLease(lease, invoices);
    leaseResults.push({
      leaseId: lease.id,
      tenant: person?.displayName || lease.personId,
      email: person?.email || '',
      missingPeriods: missing,
      createdCount: dryRun ? 0 : createdInvoices.length,
      wouldCreateCount: missing.length,
      balanceDueCents: computeBalanceDue(lease, invoices),
      openInvoiceCount: openInvoices.length,
      email,
    });
  }

  return {
    asOf: now.toISOString(),
    dryRun: Boolean(dryRun),
    leaseCount: active.length,
    created,
    emailed,
    leases: leaseResults,
    errors,
  };
}
