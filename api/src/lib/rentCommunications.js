import { sendTenantEmail } from './acsNotify.js';
import { invoiceRemainingCents } from './invoices.js';
import {
  billingPeriodForSchedulingDay,
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
];

const MESSAGE_PRIORITY = {
  balance_overdue: 1,
  grace_warning: 2,
  due_reminder: 3,
  invoice_notice: 4,
};

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

function dollars(cents) {
  return `$${(Number(cents) / 100).toFixed(2)}`;
}

function ordinal(day) {
  if (day >= 11 && day <= 13) return `${day}th`;
  return `${day}${{ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] || 'th'}`;
}

export function buildCommunicationMessage({ messageType, person, period, amountCents, payUrl = portalPayUrl() }) {
  const tenant = person?.displayName || 'Tenant';
  const month = period ? monthLabel(period.periodStart) : 'this month';
  const amount = dollars(amountCents);
  const graceEndDay = 1 + GRACE_DAYS;
  const payLine = `Pay online in the renter portal: ${payUrl}`;
  const policy =
    `If the full balance is not paid by the end of the ${ordinal(graceEndDay)}, a ${dollars(LATE_FEE_CENTS)} late fee is added. ` +
    `You can make partial payments (minimum ${dollars(MIN_PARTIAL_PAYMENT_CENTS)}) to lower your balance, ` +
    'but only payment in full within the grace period avoids the late fee.';
  const sign = '— West Cherokee Properties';

  const bodies = {
    balance_overdue: `Hi ${tenant},\n\nYour rent for ${month} is past due, including any applicable late fee. Balance due: ${amount}.\n\n${payLine}\n\n${sign}`,
    grace_warning: `Hi ${tenant},\n\nRent for ${month} was due on the 1st and your account is in the grace period. Balance due: ${amount}.\n\n${policy}\n\n${payLine}\n\n${sign}`,
    due_reminder: `Hi ${tenant},\n\nRent for ${month} is due today. Balance due: ${amount}.\n\n${policy}\n\n${payLine}\n\n${sign}`,
    invoice_notice: `Hi ${tenant},\n\nYour rent charge for ${month} has been posted. Balance due on the 1st: ${amount}.\n\n${policy}\n\n${payLine}\n\n${sign}`,
  };

  const subjects = {
    balance_overdue: `Past-due rent — ${month}`,
    grace_warning: `Rent grace period — ${month}`,
    due_reminder: `Rent due today — ${month}`,
    invoice_notice: `Rent charge posted — ${month}`,
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

  if (unpaidMonth.some((invoice) => invoiceHasLateFee(invoice, baseCents)) || day > graceEndDay) {
    const lastOverdue = commState?.lastMessageType === 'balance_overdue' ? commState.lastSentDate : '';
    const repeatOk =
      !lastOverdue || daysSinceIsoDate(lastOverdue, today) >= OVERDUE_REPEAT_DAYS || day <= graceEndDay + 1;
    if (day > graceEndDay && repeatOk && totalDue > 0) {
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

  const schedulePeriod = billingPeriodForSchedulingDay(now);
  if (schedulePeriod) {
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
    rows.push({
      leaseId: lease.id,
      tenant: person?.displayName || lease.personId,
      email: person?.email || '',
      messageType: selected.messageType,
      periodStart: selected.period?.periodStart || '',
      amountCents: selected.amountCents,
      alreadySentToday: Boolean(existing),
      subject: content.subject,
    });
  }

  return { asOf: now.toISOString(), date: today, messages: rows };
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
  const errors = [];

  for (const row of previewRows.messages) {
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

  return { skipped: false, sent, preview, enabled, errors };
}
