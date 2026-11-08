import { sendTenantEmail } from './acsNotify.js';
import { invoiceRemainingCents } from './invoices.js';
import { formatMoney } from './leaseTerms.js';
import { toE164 } from './people.js';
import {
  billingPeriodsForLookback,
  currentMonthPeriodFromNow,
  nyTodayIso,
} from './rentBilling.js';
import { MIN_PARTIAL_PAYMENT_CENTS } from './rentPayments.js';
import { sentConfigured, sendTenantSms } from './sentNotify.js';
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

/** Short SMS twin of buildCommunicationMessage (dual-channel). */
export function buildCommunicationSms({
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
  const monthsList =
    (catchupMonths || []).length > 0
      ? catchupMonths.map((iso) => monthLabel(iso)).join(', ')
      : month;

  const lines = {
    balance_overdue: `WCP: ${tenant}, rent for ${month} is past due. Balance ${amount}. Pay: ${payUrl}`,
    grace_warning: `WCP: ${tenant}, rent for ${month} is in grace. Balance ${amount}. Pay in full by the 4th to avoid a ${formatMoney(LATE_FEE_CENTS)} late fee. ${payUrl}`,
    due_reminder: `WCP: ${tenant}, rent for ${month} is due today. Balance ${amount}. ${payUrl}`,
    invoice_notice: `WCP: ${tenant}, ${month} rent charge posted. Balance due on the 1st: ${amount}. ${payUrl}`,
    invoice_catchup_notice: `WCP: ${tenant}, catch-up rent posted (${monthsList}). No late fee on these. Balance ${amount}. ${payUrl}`,
    balance_notice: `WCP: ${tenant}, rent balance statement: ${amount}. ${payUrl}`,
  };

  return lines[messageType] || lines.due_reminder;
}

function personPhoneE164(person) {
  return toE164(person?.phone || '');
}

function channelPlan(person, env = process.env) {
  const email = String(person?.email || '').trim();
  const phone = personPhoneE164(person);
  const canEmail = Boolean(email);
  const canSms = Boolean(phone) && sentConfigured(env);
  return { email, phone, canEmail, canSms, canSend: canEmail || canSms };
}

async function deliverDualChannels({
  person,
  content,
  smsText,
  preview,
  env,
}) {
  const plan = channelPlan(person, env);
  const result = {
    emailSent: false,
    smsSent: false,
    recipientEmail: '',
    recipientPhone: '',
    emailError: null,
    smsError: null,
  };

  if (plan.canEmail) {
    try {
      await sendTenantEmail({
        to: plan.email,
        subject: content.subject,
        plainText: content.plainText,
        preview,
        env,
      });
      result.emailSent = true;
      result.recipientEmail = preview ? String(env.CONTACT_NOTIFY_EMAIL || plan.email) : plan.email;
    } catch (err) {
      result.emailError = err instanceof Error ? err.message : 'email_failed';
    }
  }

  if (plan.canSms) {
    try {
      const sms = await sendTenantSms({
        to: plan.phone,
        text: smsText,
        preview,
        env,
      });
      result.smsSent = true;
      result.recipientPhone = sms.to;
    } catch (err) {
      result.smsError = err instanceof Error ? err.message : 'sms_failed';
    }
  }

  return result;
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
    const phone = personPhoneE164(person);
    const email = String(person?.email || '').trim();
    const smsConfigured = sentConfigured();
    let skippedReason = null;
    if (!hasConsent) skippedReason = 'no_consent';
    else if (!email && !phone) skippedReason = 'no_tenant_contact';
    else if (!email && phone && !smsConfigured) skippedReason = 'sent_not_configured';

    rows.push({
      leaseId: lease.id,
      tenant: person?.displayName || lease.personId,
      email,
      phone: phone || '',
      smsEligible: Boolean(phone) && smsConfigured,
      messageType: selected.messageType,
      periodStart: selected.period?.periodStart || '',
      amountCents: selected.amountCents,
      alreadySentToday: Boolean(existing),
      autoCommunicationsEnabled: hasConsent,
      skippedReason,
      subject: content.subject,
    });
  }

  return { asOf: now.toISOString(), date: today, messages: rows };
}

/**
 * Explicit staff one-off tenant notice (email and/or SMS). Does not require
 * per-renter auto consent or RENT_COMMUNICATIONS_ENABLED. Preview redirects
 * email to CONTACT_NOTIFY_EMAIL and SMS to ALERT_PHONE.
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
  const plan = channelPlan(person, env);
  if (!plan.canSend) {
    return { skipped: true, reason: 'no_tenant_contact' };
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
  const smsText = buildCommunicationSms({
    messageType,
    person,
    period: { periodStart },
    amountCents,
    payUrl: portalPayUrl(env),
    catchupMonths,
  });

  const delivery = await deliverDualChannels({
    person,
    content,
    smsText,
    preview,
    env,
  });

  if (!delivery.emailSent && !delivery.smsSent) {
    const err = new Error(delivery.emailError || delivery.smsError || 'Failed to send notice');
    err.name = 'ContactAcsError';
    throw err;
  }

  await store.createCommunicationLog({
    leaseId,
    messageType,
    sentDate: today,
    recipientEmail: delivery.recipientEmail || '',
    recipientPhone: delivery.recipientPhone || '',
    emailSent: delivery.emailSent,
    smsSent: delivery.smsSent,
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

  return {
    skipped: false,
    sent: true,
    preview,
    subject: content.subject,
    messageType,
    emailSent: delivery.emailSent,
    smsSent: delivery.smsSent,
    emailError: delivery.emailError,
    smsError: delivery.smsError,
  };
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

  if (result.skipped && result.reason === 'no_tenant_contact') {
    const err = new Error('Tenant has no email or phone on file.');
    err.name = 'ValidationError';
    throw err;
  }
  if (result.skipped && result.reason === 'already_sent_today') {
    const err = new Error('A tenant notice was already sent for this lease today.');
    err.name = 'ConflictError';
    throw err;
  }

  return {
    leaseId: lease.id,
    tenant: person.displayName,
    email: person.email,
    phone: person.phone,
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
    if (row.skippedReason || row.alreadySentToday) continue;
    if (!row.email && !row.phone) continue;
    try {
      const person = {
        displayName: row.tenant,
        email: row.email,
        phone: row.phone,
      };
      const content = buildCommunicationMessage({
        messageType: row.messageType,
        person,
        period: { periodStart: row.periodStart },
        amountCents: row.amountCents,
        payUrl: portalPayUrl(env),
      });
      const smsText = buildCommunicationSms({
        messageType: row.messageType,
        person,
        period: { periodStart: row.periodStart },
        amountCents: row.amountCents,
        payUrl: portalPayUrl(env),
      });

      let delivery = {
        emailSent: false,
        smsSent: false,
        recipientEmail: '',
        recipientPhone: '',
        emailError: null,
        smsError: null,
      };
      if (enabled || preview) {
        delivery = await deliverDualChannels({
          person,
          content,
          smsText,
          preview,
          env,
        });
        if (!delivery.emailSent && !delivery.smsSent) {
          errors.push({
            leaseId: row.leaseId,
            error: delivery.emailError || delivery.smsError || 'send_failed',
          });
          continue;
        }
      }

      await store.createCommunicationLog({
        leaseId: row.leaseId,
        messageType: row.messageType,
        sentDate: today,
        recipientEmail: delivery.recipientEmail || '',
        recipientPhone: delivery.recipientPhone || '',
        emailSent: delivery.emailSent,
        smsSent: delivery.smsSent,
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
