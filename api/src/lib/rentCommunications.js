import { sendTenantEmail } from './acsNotify.js';
import { invoiceRemainingCents } from './invoices.js';
import { formatMoney } from './leaseTerms.js';
import {
  billingPeriodsForLookback,
  currentMonthPeriodFromNow,
  nyTodayIso,
} from './rentBilling.js';
import { MIN_PARTIAL_PAYMENT_CENTS } from './rentPayments.js';
import {
  expectedMonthlyChargeCents,
  GRACE_DAYS,
  invoiceHasLateFee,
  invoicesForCurrentMonth,
  invoicesForPeriod,
  LATE_FEE_CENTS,
  monthLabel,
  nyDateParts,
} from './unitHealth.js';
import { openInvoicesForLease } from './unitDetail.js';
import {
  rentCommunicationsEnabled,
  rentCommunicationsPreview,
} from './stripeWebhook.js';

export const MESSAGE_TYPES = [
  'balance_overdue',
  'grace_warning',
  'due_reminder',
  'invoice_notice',
  'invoice_catchup_notice',
  'balance_notice',
];

const MESSAGE_PRIORITY = {
  balance_overdue: 1,
  grace_warning: 2,
  due_reminder: 3,
  invoice_notice: 4,
  invoice_catchup_notice: 5,
  balance_notice: 6,
};

export function personAllowsAutoCommunications(person) {
  return Boolean(person?.autoCommunicationsEnabled);
}

const OVERDUE_REPEAT_DAYS = 7;

function daysSinceIsoDate(fromIso, toIso) {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86_400_000);
}

export function portalPayUrl(env = process.env) {
  const site = String(env.SITE_URL || 'https://westcherokee.com').replace(/\/+$/, '');
  return `${site}/portal/invoices`;
}


function ordinal(day) {
  if (day >= 11 && day <= 13) return `${day}th`;
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th'}`;
}

export function buildCommunicationMessage({
  messageType,
  person,
  period,
  amountCents,
  payUrl = portalPayUrl(),
  catchupMonths = [],
}) {
  const tenant = person?.displayName || 'Tenant';
  const month = period ? monthLabel(period.periodStart) : 'this month';
  const amount = formatMoney(amountCents);
  const graceEndDay = 1 + GRACE_DAYS;
  const payLine = `Pay online in the renter portal: ${payUrl}`;
  const policy =
    `If the full balance is not paid by the end of the ${ordinal(graceEndDay)}, a ${formatMoney(LATE_FEE_CENTS)} late fee is added. ` +
    `You can make partial payments (minimum ${formatMoney(MIN_PARTIAL_PAYMENT_CENTS)}) to lower your balance, ` +
    'but only payment in full within the grace period avoids the late fee.';
  const sign = '— West Cherokee Properties';
  const monthsList =
    (catchupMonths || []).length > 0
      ? catchupMonths.map((iso) => monthLabel(iso)).join(', ')
      : month;

  const bodies = {
    balance_overdue: `Hi ${tenant},\n\nYour rent for ${month} is past due, including any applicable late fee. Balance due: ${amount}.\n\n${payLine}\n\n${sign}`,
    grace_warning: `Hi ${tenant},\n\nRent for ${month} was due on the 1st and your account is in the grace period. Balance due: ${amount}.\n\n${policy}\n\n${payLine}\n\n${sign}`,
    due_reminder: `Hi ${tenant},\n\nRent for ${month} is due today. Balance due: ${amount}.\n\n${policy}\n\n${payLine}\n\n${sign}`,
    invoice_notice: `Hi ${tenant},\n\nYour rent charge for ${month} has been posted. Balance due on the 1st: ${amount}.\n\n${policy}\n\n${payLine}\n\n${sign}`,
    invoice_catchup_notice:
      `Hi ${tenant},\n\nWe apologize for the inconvenience — rent charges for the following month(s) were posted later than usual: ${monthsList}.\n\n` +
      `Because this delay was on our side, no late fee is applied to these catch-up charges. Your current balance due is ${amount}.\n\n` +
      `${payLine}\n\n${sign}`,
    balance_notice: `Hi ${tenant},\n\nHere is your current rent balance statement. Balance due: ${amount}.\n\n${payLine}\n\n${sign}`,
  };

  const subjects = {
    balance_overdue: `Past-due rent — ${month}`,
    grace_warning: `Rent grace period — ${month}`,
    due_reminder: `Rent due today — ${month}`,
    invoice_notice: `Rent charge posted — ${month}`,
    invoice_catchup_notice: `Rent charges posted (catch-up) — apology`,
    balance_notice: `Rent balance statement — ${month}`,
  };

  return {
    subject: subjects[messageType] || `Rent notice — ${month}`,
    plainText: bodies[messageType] || bodies.due_reminder,
  };
}

export function selectCommunicationForLease({
  lease,
  invoices,
  commState,
  now = new Date(),
}) {
  if (!lease || lease.status !== 'active') return null;

  const today = nyTodayIso(now);
  const { day } = nyDateParts(now);
  const graceEndDay = 1 + GRACE_DAYS;
  const period = currentMonthPeriodFromNow(now);
  const monthInvoices = invoicesForCurrentMonth(invoices, lease.id, now);
  const unpaidMonth = monthInvoices.filter((invoice) => invoice.status !== 'paid');
  const baseCents = expectedMonthlyChargeCents(lease);
  const openAll = openInvoicesForLease(lease, invoices);
  const totalDue = openAll.reduce((sum, row) => sum + invoiceRemainingCents(row), 0);

  const candidates = [];

  // Only current/prior months are "past due". Next month's charge (posted ~10 days early) is not.
  const pastDueCents = openAll
    .filter((invoice) => String(invoice.periodStart) <= period.periodStart)
    .reduce((sum, invoice) => sum + invoiceRemainingCents(invoice), 0);

  if (unpaidMonth.some((invoice) => invoiceHasLateFee(invoice, baseCents)) || day > graceEndDay) {
    const lastOverdue = commState?.lastMessageType === 'balance_overdue' ? commState.lastSentDate : '';
    const repeatOk =
      !lastOverdue || daysSinceIsoDate(lastOverdue, today) >= OVERDUE_REPEAT_DAYS || day <= graceEndDay + 1;
    if (day > graceEndDay && repeatOk && pastDueCents > 0) {
      candidates.push({
        messageType: 'balance_overdue',
        period,
        amountCents: totalDue,
      });
    }
  }

  if (day >= 2 && day <= graceEndDay && unpaidMonth.length > 0) {
    candidates.push({
      messageType: 'grace_warning',
      period,
      amountCents: totalDue,
    });
  }

  if (day === 1 && unpaidMonth.length > 0) {
    candidates.push({
      messageType: 'due_reminder',
      period,
      amountCents: totalDue,
    });
  }

  for (const schedulePeriod of billingPeriodsForLookback(now)) {
    const scheduleInvoices = invoicesForPeriod(
      invoices,
      lease.id,
      schedulePeriod.periodStart,
      schedulePeriod.periodEnd,
    ).filter((invoice) => invoice.status !== 'paid');
    const alreadyNotified = commState?.lastInvoiceNoticePeriod === schedulePeriod.periodStart;
    if (scheduleInvoices.length > 0 && !alreadyNotified) {
      candidates.push({
        messageType: 'invoice_notice',
        period: schedulePeriod,
        amountCents: totalDue || invoiceRemainingCents(scheduleInvoices[0]),
      });
      break;
    }
  }

  if (!candidates.length) return null;

  candidates.sort((a, b) => MESSAGE_PRIORITY[a.messageType] - MESSAGE_PRIORITY[b.messageType]);
  return candidates[0];
}

export async function previewCommunications(store, now = new Date()) {
  const [leases, invoices, people] = await Promise.all([
    store.listLeases(),
    store.listInvoices(),
    store.listPeople(),
  ]);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const today = nyTodayIso(now);
  const rows = [];

  for (const lease of leases.filter((row) => row.status === 'active')) {
    const commState = await store.getTenantCommunicationState(lease.id);
    const existing = await store.getCommunicationLogForLeaseDate(lease.id, today);
    const selected = selectCommunicationForLease({ lease, invoices, commState, now });
    if (!selected) continue;
    const person = peopleById.get(lease.personId);
    const content = buildCommunicationMessage({
      messageType: selected.messageType,
      person,
      period: selected.period,
      amountCents: selected.amountCents,
    });
    const hasConsent = personAllowsAutoCommunications(person);
    rows.push({
      leaseId: lease.id,
      tenant: person?.displayName || lease.personId,
      email: person?.email || '',
      messageType: selected.messageType,
      periodStart: selected.period?.periodStart || '',
      amountCents: selected.amountCents,
      alreadySentToday: Boolean(existing),
      autoCommunicationsEnabled: hasConsent,
      skippedReason: hasConsent ? null : 'no_consent',
      subject: content.subject,
    });
  }

  return { asOf: now.toISOString(), date: today, messages: rows };
}

/**
 * Explicit staff one-off tenant email. Does not require per-renter auto consent
 * or RENT_COMMUNICATIONS_ENABLED. Preview still redirects to CONTACT_NOTIFY_EMAIL.
 */
export async function sendOneOffTenantCommunication(
  store,
  {
    leaseId,
    person,
    messageType,
    amountCents,
    periodStart,
    catchupMonths = [],
    env = process.env,
    now = new Date(),
  },
) {
  const preview = rentCommunicationsPreview(env);
  const today = nyTodayIso(now);
  const email = String(person?.email || '').trim();
  if (!email) {
    return { skipped: true, reason: 'no_tenant_email' };
  }

  const existingLog = await store.getCommunicationLogForLeaseDate(leaseId, today);
  if (existingLog) {
    return { skipped: true, reason: 'already_sent_today' };
  }

  const content = buildCommunicationMessage({
    messageType,
    person,
    period: { periodStart },
    amountCents,
    payUrl: portalPayUrl(env),
    catchupMonths,
  });

  await sendTenantEmail({
    to: email,
    subject: content.subject,
    plainText: content.plainText,
    preview,
    env,
  });

  await store.createCommunicationLog({
    leaseId,
    messageType,
    sentDate: today,
    recipientEmail: preview ? String(env.CONTACT_NOTIFY_EMAIL || email) : email,
    preview,
    periodStart: periodStart || undefined,
  });

  const statePatch = {
    lastSentDate: today,
    lastMessageType: messageType,
  };
  if (messageType === 'invoice_notice' && periodStart) {
    statePatch.lastInvoiceNoticePeriod = periodStart;
  }
  await store.upsertTenantCommunicationState(leaseId, statePatch);

  return { skipped: false, sent: true, preview, subject: content.subject, messageType };
}

export async function sendLeaseBalanceNotice(store, leaseId, { env = process.env, now = new Date() } = {}) {
  const lease = await store.getLease(leaseId);
  if (!lease) {
    const err = new Error('Lease not found.');
    err.name = 'NotFoundError';
    throw err;
  }
  if (lease.status !== 'active') {
    const err = new Error('Lease is not active.');
    err.name = 'ValidationError';
    throw err;
  }

  const [person, invoices] = await Promise.all([store.getPerson(lease.personId), store.listInvoices()]);
  if (!person) {
    const err = new Error('Tenant not found.');
    err.name = 'NotFoundError';
    throw err;
  }

  const open = openInvoicesForLease(lease, invoices);
  const amountCents = open.reduce((sum, row) => sum + invoiceRemainingCents(row), 0);
  const periodStart =
    open[0]?.periodStart || currentMonthPeriodFromNow(now).periodStart;

  const result = await sendOneOffTenantCommunication(store, {
    leaseId: lease.id,
    person,
    messageType: 'balance_notice',
    amountCents,
    periodStart,
    env,
    now,
  });

  if (result.skipped && result.reason === 'no_tenant_email') {
    const err = new Error('Tenant has no email on file.');
    err.name = 'ValidationError';
    throw err;
  }
  if (result.skipped && result.reason === 'already_sent_today') {
    const err = new Error('A tenant email was already sent for this lease today.');
    err.name = 'ConflictError';
    throw err;
  }

  return {
    leaseId: lease.id,
    tenant: person.displayName,
    email: person.email,
    amountCents,
    ...result,
  };
}

export async function runRentCommunicationScheduler(store, env = process.env, now = new Date()) {
  const enabled = rentCommunicationsEnabled(env);
  const preview = rentCommunicationsPreview(env);
  if (!enabled && !preview) {
    return { skipped: true, reason: 'communications_disabled', sent: 0 };
  }

  const previewRows = await previewCommunications(store, now);
  const today = nyTodayIso(now);
  let sent = 0;
  let skippedNoConsent = 0;
  const errors = [];

  for (const row of previewRows.messages) {
    if (row.skippedReason === 'no_consent') {
      skippedNoConsent += 1;
      continue;
    }
    if (row.alreadySentToday || !row.email) continue;
    try {
      const content = buildCommunicationMessage({
        messageType: row.messageType,
        person: { displayName: row.tenant, email: row.email },
        period: { periodStart: row.periodStart },
        amountCents: row.amountCents,
        payUrl: portalPayUrl(env),
      });

      if (enabled || preview) {
        await sendTenantEmail({
          to: row.email,
          subject: content.subject,
          plainText: content.plainText,
          preview,
        });
      }

      await store.createCommunicationLog({
        leaseId: row.leaseId,
        messageType: row.messageType,
        sentDate: today,
        recipientEmail: preview ? String(env.CONTACT_NOTIFY_EMAIL || row.email) : row.email,
        preview,
        periodStart: row.periodStart || undefined,
      });

      const statePatch = {
        lastSentDate: today,
        lastMessageType: row.messageType,
      };
      if (row.messageType === 'invoice_notice' && row.periodStart) {
        statePatch.lastInvoiceNoticePeriod = row.periodStart;
      }
      await store.upsertTenantCommunicationState(row.leaseId, statePatch);
      sent += 1;
    } catch (err) {
      errors.push({ leaseId: row.leaseId, error: err instanceof Error ? err.message : 'unknown' });
    }
  }

  return { skipped: false, sent, skippedNoConsent, preview, enabled, errors };
}
