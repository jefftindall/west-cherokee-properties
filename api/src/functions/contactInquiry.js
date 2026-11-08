import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { failureResponse, jsonOk } from '../lib/httpErrors.js';
import { sendInquiryEmail } from '../lib/acsNotify.js';
import { alertPhoneE164, sendStaffSms, sentConfigured } from '../lib/sentNotify.js';
import { verifyTurnstile } from '../lib/turnstile.js';

const inquirySchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: z.email().max(320),
  message: z.string().trim().min(1).max(5000),
  turnstileToken: z.string().trim().min(1),
  /** Client retry-session id from Report an issue (hidden field). */
  clientCorrelationId: z
    .string()
    .trim()
    .max(80)
    .regex(/^[A-Za-z0-9._:-]+$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

app.http('contactInquiry', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'contactInquiry',
  handler: async (request) => {
    const correlationId = newCorrelationId();
    try {
      const body = await request.json();
      const parsed = inquirySchema.safeParse(body);
      if (!parsed.success) {
        const err = new Error('Please check the form fields and try again.');
        err.name = 'ContactValidationError';
        throw err;
      }
      const remoteIp =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || undefined;
      await verifyTurnstile(parsed.data.turnstileToken, remoteIp);
      await sendInquiryEmail({ ...parsed.data, correlationId });
      if (sentConfigured() && alertPhoneE164()) {
        try {
          await sendStaffSms({
            text: `WCP contact from ${parsed.data.name} (${parsed.data.email}). Check staff inbox. Ref ${correlationId}`,
          });
        } catch {
          // Email already delivered; staff SMS is best-effort.
        }
      }
      return jsonOk({ ok: true, correlationId });
    } catch (err) {
      const failure = failureResponse(err, correlationId);
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  },
});
