import { EmailClient } from '@azure/communication-email';

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
