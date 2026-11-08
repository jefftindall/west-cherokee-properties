import { toE164 } from './people.js';

const SENT_MESSAGES_URL = 'https://api.sent.dm/v3/messages';

export function sentConfigured(env = process.env) {
  const key = String(env.SENT_API_KEY || '').trim();
  return Boolean(key && key !== 'REPLACE_ME');
}

export function sentSandbox(env = process.env) {
  return String(env.SENT_SANDBOX || '').trim().toLowerCase() === 'true';
}

export function alertPhoneE164(env = process.env) {
  return toE164(env.ALERT_PHONE || '');
}

/**
 * Low-level Sent SMS send. `to` must already be E.164.
 * Preview redirects to ALERT_PHONE and prefixes the body.
 */
export async function sendSms({ to, text, preview = false, env = process.env, fetchImpl = fetch }) {
  if (!sentConfigured(env)) {
    const err = new Error('Missing SENT_API_KEY');
    err.name = 'SentConfigError';
    throw err;
  }

  const apiKey = String(env.SENT_API_KEY || '').trim();
  const intended = String(to || '').trim();
  const previewTo = alertPhoneE164(env);
  const recipient = preview ? previewTo : intended;
  if (!recipient) {
    const err = new Error(preview ? 'Missing ALERT_PHONE for SMS preview' : 'Missing SMS recipient');
    err.name = 'SentConfigError';
    throw err;
  }

  const bodyText = preview ? `[PREVIEW for ${intended}] ${text}` : String(text || '');
  const payload = {
    to: [recipient],
    text: bodyText,
    channel: ['sms'],
  };
  if (sentSandbox(env)) {
    payload.sandbox = true;
  }

  let response;
  try {
    response = await fetchImpl(SENT_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    const wrapped = new Error(err instanceof Error ? err.message : 'Sent network error');
    wrapped.name = 'SentSendError';
    throw wrapped;
  }

  if (!response.ok) {
    const wrapped = new Error(`Sent SMS failed (${response.status})`);
    wrapped.name = 'SentSendError';
    throw wrapped;
  }

  let json = null;
  try {
    json = await response.json();
  } catch {
    json = null;
  }

  const messageId = json?.data?.recipients?.[0]?.message_id || null;
  return {
    ok: true,
    to: recipient,
    intendedTo: intended,
    preview: Boolean(preview),
    messageId,
    sandbox: sentSandbox(env),
  };
}

export async function sendTenantSms({ to, text, preview = false, env = process.env, fetchImpl = fetch }) {
  const e164 = toE164(to);
  if (!e164) {
    const err = new Error('Tenant phone is not a valid US number');
    err.name = 'SentConfigError';
    throw err;
  }
  return sendSms({ to: e164, text, preview, env, fetchImpl });
}

/** Staff/ops pager — always ALERT_PHONE (preview flag ignored for destination). */
export async function sendStaffSms({ text, env = process.env, fetchImpl = fetch }) {
  const to = alertPhoneE164(env);
  if (!to) {
    const err = new Error('Missing ALERT_PHONE');
    err.name = 'SentConfigError';
    throw err;
  }
  return sendSms({ to, text, preview: false, env, fetchImpl });
}
