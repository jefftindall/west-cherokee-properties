import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { failureResponse, jsonOk } from '../lib/httpErrors.js';
import { officeCaller, permissionGate } from '../lib/officeAccess.js';
import { PERMISSION } from '../lib/permissions.js';
import { approveApplication } from '../lib/applications.js';
import { getStore } from '../lib/store.js';
import {
  createStripeInvoiceForRow,
  rentPaymentsEnabled,
  stripeWebhookClient,
} from '../lib/stripeWebhook.js';

function wrap(handler) {
  return async (request) => {
    const correlationId = newCorrelationId();
    try {
      return await handler(request, correlationId);
    } catch (err) {
      const failure = failureResponse(err, correlationId);
      return { status: failure.status, jsonBody: failure.jsonBody };
    }
  };
}

app.http('officeHealth', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/health',
  handler: wrap(async (request) => {
    const caller = await officeCaller(request);
    return jsonOk({ ok: true, email: caller.email });
  }),
});

app.http('officeApplications', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/applications',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.APPLICATIONS_READ);
    return jsonOk({ applications: await getStore().listApplications() });
  }),
});

app.http('officeApplicationPatch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'office/applications/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.APPLICATIONS_WRITE);
    const id = request.params.id;
    const body = await request.json();
    const status = String(body.status || '');
    const store = getStore();
    if (status === 'approved') {
      const units = await store.listUnits();
      const leases = await store.listLeases();
      const taken = new Set(leases.filter((l) => l.status === 'active').map((l) => l.unitId));
      const unit = units.find((u) => !taken.has(u.id));
      if (!unit) {
        const err = new Error('No vacant unit is available.');
        err.name = 'ConflictError';
        throw err;
      }
      const application = await store.getApplication(id);
      const start = application?.desiredMoveIn || new Date().toISOString().slice(0, 10);
      const end = `${Number(start.slice(0, 4)) + 1}${start.slice(4)}`;
      const result = await approveApplication(store, id, {
        unitId: body.unitId || unit.id,
        startDate: body.startDate || start,
        endDate: body.endDate || end,
        rentCents: Number(body.rentCents) || 125000,
      });
      return jsonOk(result);
    }
    const application = await store.updateApplicationStatus(id, status);
    return jsonOk({ application });
  }),
});

app.http('officePeople', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/people',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.PEOPLE_READ);
    return jsonOk({ people: await getStore().listPeople() });
  }),
});

app.http('officeLeasesGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/leases',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_READ);
    return jsonOk({ leases: await getStore().listLeases() });
  }),
});

app.http('officeLeasesPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'office/leases',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_WRITE);
    const body = z
      .object({
        unitId: z.string().min(1),
        personEmail: z.email(),
        startDate: z.string().min(8),
        endDate: z.string().min(8),
        rentCents: z.number().int().positive(),
      })
      .parse(await request.json());
    const store = getStore();
    const person = await store.upsertPerson({ displayName: body.personEmail, email: body.personEmail });
    const lease = await store.createLease({ ...body, personId: person.id });
    return jsonOk({ lease }, 201);
  }),
});

app.http('officeInvoicesGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/invoices',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.INVOICES_READ);
    return jsonOk({ invoices: await getStore().listInvoices() });
  }),
});

app.http('officeInvoicesPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'office/invoices',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.INVOICES_WRITE);
    const body = z
      .object({
        leaseId: z.string().min(1),
        periodStart: z.string().min(8),
        periodEnd: z.string().min(8),
      })
      .parse(await request.json());
    const store = getStore();
    const lease = await store.getLease(body.leaseId);
    if (!lease) {
      const err = new Error('Lease not found.');
      err.name = 'NotFoundError';
      throw err;
    }
    let invoice = await store.createInvoice({
      leaseId: lease.id,
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
      amountCents: lease.rentCents,
    });
    if (rentPaymentsEnabled() && process.env.STRIPE_SECRET_KEY?.startsWith('sk_') && !process.env.STRIPE_SECRET_KEY.includes('not_configured')) {
      const stripe = stripeWebhookClient(process.env.STRIPE_SECRET_KEY);
      const person = await store.getPerson(lease.personId);
      const customer = await stripe.customers.create({ email: person.email, name: person.displayName });
      const stripeInv = await createStripeInvoiceForRow({
        stripe,
        customerId: customer.id,
        appInvoice: invoice,
        siteUrl: process.env.SITE_URL || 'https://westcherokee.com',
      });
      invoice = await store.updateInvoice(invoice.id, stripeInv);
    }
    return jsonOk({ invoice }, 201);
  }),
});

app.http('officeRequestsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/service-requests',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.REQUESTS_READ);
    return jsonOk({ requests: await getStore().listServiceRequests() });
  }),
});

app.http('officeRequestPatch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'office/service-requests/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.REQUESTS_WRITE);
    const body = await request.json();
    const requestRow = await getStore().updateServiceRequest(request.params.id, { status: body.status });
    return jsonOk({ request: requestRow });
  }),
});

app.http('officeAccess', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/access',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.USERS_READ);
    return jsonOk({ users: await getStore().listOfficeUsers() });
  }),
});
