import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { failureResponse, jsonOk } from '../lib/httpErrors.js';
import { verifyTurnstile } from '../lib/turnstile.js';
import { getStore } from '../lib/store.js';

const applySchema = z.object({
  propertySlug: z.string().trim().min(1).max(64),
  fullName: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  phone: z.string().trim().min(7).max(40),
  desiredMoveIn: z.string().trim().min(8).max(10),
  householdSize: z.number().int().min(1).max(12),
  notes: z.string().trim().max(4000).optional().default(''),
  turnstileToken: z.string().trim().min(1),
});

app.http('apply', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'apply',
  handler: async (request) => {
    const correlationId = newCorrelationId();
    try {
      const body = await request.json();
      const parsed = applySchema.safeParse(body);
      if (!parsed.success) {
        const err = new Error('Please check the form fields and try again.');
        err.name = 'ContactValidationError';
        throw err;
      }
      const remoteIp =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
      await verifyTurnstile(parsed.data.turnstileToken, remoteIp);
      const store = getStore();
      const properties = await store.listProperties();
      if (!properties.some((p) => p.slug === parsed.data.propertySlug)) {
        const err = new Error('Unknown community.');
        err.name = 'ValidationError';
        throw err;
      }
      const application = await store.createApplication(parsed.data);
      return jsonOk({ ok: true, id: application.id, correlationId }, 201);
    } catch (err) {
      const failure = failureResponse(err, correlationId);
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
