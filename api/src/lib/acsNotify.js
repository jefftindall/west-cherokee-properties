import { EmailClient } from '@azure/communication-email';

function acsConfigured(env = process.env) {
  const connection = String(env.ACS_CONNECTION_STRING || '').trim();
  const sender = String(env.ACS_EMAIL_SENDER || '').trim();
  return connection && connection !== 'REPLACE_ME' && sender && sender !== 'REPLACE_ME';
}

export async function sendInquiryEmail({ name, email, message, correlationId, clientCorrelationId }) {
  const connection = String(process.env.ACS_CONNECTION_STRING || '').trim();
  const sender = String(process.env.ACS_EMAIL_SENDER || '').trim();
  const to = String(process.env.CONTACT_NOTIFY_EMAIL || '').trim();
  if (!connection || connection === 'REPLACE_ME' || !sender || sender === 'REPLACE_ME' || !to) {
    const err = new Error('Missing ACS_CONNECTION_STRING, ACS_EMAIL_SENDER, or CONTACT_NOTIFY_EMAIL');
    err.name = 'ContactConfigError';
    throw err;
  }
  const clientRef = String(clientCorrelationId || '').trim();
  const refs = [`Reference: ${correlationId}`];
  if (clientRef) refs.push(`Client correlation: ${clientRef}`);
  try {
    const client = new EmailClient(connection);
    await client.beginSend({
      senderAddress: sender,
      content: {
        subject: `WCP contact from ${name}`,
        plainText: `${message}\n\nFrom: ${email}\n${refs.join('\n')}`,
      },
      recipients: { to: [{ address: to }] },
    });
  } catch (err) {
    const wrapped = new Error(err instanceof Error ? err.message : 'ACS send failed');
    wrapped.name = 'ContactAcsError';
    throw wrapped;
  }
}

/** Tenant rent communications — routes to staff inbox when preview mode is on. */
export async function sendTenantEmail({ to, subject, plainText, preview = false, env = process.env }) {
  if (!acsConfigured(env)) {
    const err = new Error('Missing ACS_CONNECTION_STRING or ACS_EMAIL_SENDER');
    err.name = 'ContactConfigError';
    throw err;
  }
  const connection = String(env.ACS_CONNECTION_STRING || '').trim();
  const sender = String(env.ACS_EMAIL_SENDER || '').trim();
  const recipient = preview ? String(env.CONTACT_NOTIFY_EMAIL || '').trim() : String(to || '').trim();
  if (!recipient) {
    const err = new Error('Missing tenant email or CONTACT_NOTIFY_EMAIL for preview');
    err.name = 'ContactConfigError';
    throw err;
  }

  const prefix = preview ? `[PREVIEW for ${to}] ` : '';
  try {
    const client = new EmailClient(connection);
    await client.beginSend({
      senderAddress: sender,
      content: {
        subject: `${prefix}${subject}`,
        plainText,
      },
      recipients: { to: [{ address: recipient }] },
    });
  } catch (err) {
    const wrapped = new Error(err instanceof Error ? err.message : 'ACS send failed');
    wrapped.name = 'ContactAcsError';
    throw wrapped;
  }
}
