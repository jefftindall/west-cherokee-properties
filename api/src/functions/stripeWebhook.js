import { app } from '@azure/functions';
import { newCorrelationId } from '../lib/auth.js';
import { failureResponse, jsonOk } from '../lib/httpErrors.js';
import {
  applyStripeLedgerEvent,
  stripeEventTelemetry,
  stripeWebhookClient,
  verifyStripeWebhookEvent,
} from '../lib/stripeWebhook.js';
import { getStore } from '../lib/store.js';

app.http('stripeWebhook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'stripeWebhook',
  handler: async (request, context) => {
    const correlationId = newCorrelationId();
    const rawBody = await request.text();
    const signature = request.headers.get('stripe-signature') || '';
    const stripe = stripeWebhookClient(process.env.STRIPE_SECRET_KEY || 'sk_test_not_configured');
    const verified = verifyStripeWebhookEvent({
      rawBody,
      signature,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      stripe,
    });
    if (!verified.ok) {
      return { status: verified.status, jsonBody: { error: 'Webhook rejected', correlationId } };
    }
    try {
      const result = await applyStripeLedgerEvent(verified.event, getStore());
      context.log('stripeWebhook', { ...stripeEventTelemetry(verified.event), kind: result.kind });
      return jsonOk({ ok: true, kind: result.kind, correlationId });
    } catch (err) {
      const failure = failureResponse(err, correlationId);
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
