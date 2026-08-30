import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { failureResponse, htmlOk, jsonOk } from '../lib/httpErrors.js';
import { buildLeaseDocument } from '../lib/leaseDocument.js';
import { defaultTermsForUnit, monthlyChargeCents, UNIT_LEASE_DEFAULTS } from '../lib/leaseTerms.js';
import { officeCaller, permissionGate } from '../lib/officeAccess.js';
import { PERMISSION } from '../lib/permissions.js';
import { approveApplication } from '../lib/applications.js';
import { getStore } from '../lib/store.js';
import { buildDashboard } from '../lib/unitHealth.js';
import {
  createStripeInvoiceForRow,
  rentPaymentsEnabled,
  stripeWebhookClient,
} from '../lib/stripeWebhook.js';

// SWA-linked Functions use authLevel 'anonymous' so Easy Auth can inject x-ms-client-principal.
// Office authorization is enforced in officeCaller / permissionGate, not by the Functions key.

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

app.http('officeDashboard', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/dashboard',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_READ);
    const store = getStore();
    const [properties, units, leases, people, invoices] = await Promise.all([
      store.listProperties(),
      store.listUnits(),
      store.listLeases(),
      store.listPeople(),
      store.listInvoices(),
    ]);
    return jsonOk(buildDashboard({ properties, units, leases, people, invoices }));
  }),
});

app.http('officeUnitGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/units/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_READ);
    const store = getStore();
    const unit = await store.getUnit(request.params.id);
    if (!unit) {
      const err = new Error('Unit not found.');
      err.name = 'NotFoundError';
      throw err;
    }
    const [properties, lease, people] = await Promise.all([
      store.listProperties(),
      store.getActiveLeaseForUnit(unit.id),
      store.listPeople(),
    ]);
    const property = properties.find((row) => row.id === unit.propertyId) || null;
    const tenant = lease ? people.find((person) => person.id === lease.personId) || null : null;
    return jsonOk({ unit, property, lease, tenant, unitDefaults: UNIT_LEASE_DEFAULTS[unit.id] || null });
  }),
});

app.http('officeUnitPatch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'office/units/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_WRITE);
    const body = z
      .object({
        available: z.boolean(),
      })
      .parse(await request.json());
    const unit = await getStore().updateUnit(request.params.id, body);
    return jsonOk({ unit });
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

app.http('officePeoplePost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'office/people',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.PEOPLE_WRITE);
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(200),
        email: z.email(),
        phone: z.string().trim().max(40).optional(),
      })
      .parse(await request.json());
    const person = await getStore().upsertPerson(body);
    return jsonOk({ person }, 201);
  }),
});

app.http('officePersonPatch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'office/people/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.PEOPLE_WRITE);
    const body = z
      .object({
        displayName: z.string().trim().min(1).max(200).optional(),
        email: z.email().optional(),
        phone: z.string().trim().max(40).optional(),
      })
      .parse(await request.json());
    const person = await getStore().updatePerson(request.params.id, body);
    return jsonOk({ person });
  }),
});

app.http('officeLeasesGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/leases',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_READ);
    const store = getStore();
    const [leases, units, people] = await Promise.all([store.listLeases(), store.listUnits(), store.listPeople()]);
    return jsonOk({ leases, units, people, unitDefaults: UNIT_LEASE_DEFAULTS });
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
        personId: z.string().min(1).optional(),
        personEmail: z.email().optional(),
        personName: z.string().trim().max(200).optional(),
        startDate: z.string().min(8),
        endDate: z.string().min(8),
        rentCents: z.number().int().positive(),
        status: z.enum(['active', 'ended']).optional(),
        terms: z
          .object({
            tenantNames: z.union([z.string(), z.array(z.string())]).optional(),
            authorizedOccupants: z.string().optional(),
            maxOccupants: z.number().int().min(1).max(12).optional(),
            securityDepositCents: z.number().int().positive().optional(),
            petCount: z.number().int().min(0).max(8).optional(),
            approvedPets: z.string().max(400).optional(),
            additionalProvisions: z.string().max(4000).optional(),
            landlordSignerName: z.string().max(200).optional(),
            effectiveDate: z.string().optional(),
          })
          .optional(),
      })
      .refine((data) => data.personId || data.personEmail, {
        message: 'personId or personEmail is required',
      })
      .parse(await request.json());
    const store = getStore();
    const firstTenantName = Array.isArray(body.terms?.tenantNames)
      ? body.terms.tenantNames[0]
      : body.terms?.tenantNames;
    let person;
    if (body.personId) {
      person = await store.getPerson(body.personId);
      if (!person) {
        const err = new Error('Person not found.');
        err.name = 'NotFoundError';
        throw err;
      }
    } else {
      person = await store.upsertPerson({
        displayName: body.personName || firstTenantName || body.personEmail,
        email: body.personEmail,
      });
    }
    const terms = defaultTermsForUnit(body.unitId, {
      ...body.terms,
      rentCents: body.rentCents,
      startDate: body.startDate,
      displayName: person.displayName,
    });
    const lease = await store.createLease({
      unitId: body.unitId,
      personId: person.id,
      startDate: body.startDate,
      endDate: body.endDate,
      rentCents: body.rentCents,
      status: body.status,
      terms,
    });
    return jsonOk({ lease }, 201);
  }),
});

app.http('officeLeaseGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/leases/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_READ);
    const store = getStore();
    const lease = await store.getLease(request.params.id);
    if (!lease) {
      const err = new Error('Lease not found.');
      err.name = 'NotFoundError';
      throw err;
    }
    const [person, unit] = await Promise.all([store.getPerson(lease.personId), store.getUnit(lease.unitId)]);
    return jsonOk({ lease, person, unit, unitDefaults: UNIT_LEASE_DEFAULTS[lease.unitId] || null });
  }),
});

app.http('officeLeasePatch', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'office/leases/{id}',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_WRITE);
    const body = z
      .object({
        startDate: z.string().min(8).optional(),
        endDate: z.string().min(8).optional(),
        rentCents: z.number().int().positive().optional(),
        status: z.enum(['active', 'ended']).optional(),
        terms: z
          .object({
            tenantNames: z.union([z.string(), z.array(z.string())]).optional(),
            authorizedOccupants: z.string().optional(),
            maxOccupants: z.number().int().min(1).max(12).optional(),
            securityDepositCents: z.number().int().positive().optional(),
            petCount: z.number().int().min(0).max(8).optional(),
            approvedPets: z.string().max(400).optional(),
            additionalProvisions: z.string().max(4000).optional(),
            landlordSignerName: z.string().max(200).optional(),
            effectiveDate: z.string().optional(),
          })
          .optional(),
      })
      .parse(await request.json());
    const lease = await getStore().updateLease(request.params.id, body);
    return jsonOk({ lease });
  }),
});

app.http('officeLeaseDocument', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'office/leases/{id}/document',
  handler: wrap(async (request) => {
    await permissionGate(request, PERMISSION.LEASES_READ);
    const store = getStore();
    const lease = await store.getLease(request.params.id);
    if (!lease) {
      const err = new Error('Lease not found.');
      err.name = 'NotFoundError';
      throw err;
    }
    const person = await store.getPerson(lease.personId);
    const document = buildLeaseDocument({ lease, person });
    const download = new URL(request.url).searchParams.get('download') === '1';
    return htmlOk(document.html, { filename: document.filename, download });
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
      amountCents: monthlyChargeCents(lease.rentCents, lease.terms?.petCount),
    });
    if (rentPaymentsEnabled() && process.env.STRIPE_SECRET_KEY?.startsWith('sk_') && !process.env.STRIPE_SECRET_KEY.includes('not_configured')) {
      const stripe = stripeWebhookClient(process.env.STRIPE_SECRET_KEY);
      const person = await store.getPerson(lease.personId);
      let customerId = String(person.stripeCustomerId || '').trim();
      if (!customerId) {
        const customer = await stripe.customers.create({ email: person.email, name: person.displayName });
        customerId = customer.id;
        await store.updatePersonStripeCustomerId(person.id, customerId);
      }
      const stripeInv = await createStripeInvoiceForRow({
        stripe,
        customerId,
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
