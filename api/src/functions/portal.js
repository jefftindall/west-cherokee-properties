import { app } from '@azure/functions';
import { z } from 'zod';
import { newCorrelationId } from '../lib/auth.js';
import { failureResponse, htmlOk, jsonOk } from '../lib/httpErrors.js';
import { buildLeaseDocument } from '../lib/leaseDocument.js';
import { portalCaller } from '../lib/officeAccess.js';
import { invoiceOwnedByPerson, invoiceRemainingCents } from '../lib/invoices.js';
import {
  computeLeaseBalance,
  createRentCheckout,
  lateFeeNotice,
  MIN_PARTIAL_PAYMENT_CENTS,
} from '../lib/rentPayments.js';
import { requestOwnedByPerson } from '../lib/serviceRequests.js';
import { getStore } from '../lib/store.js';
import { stripeReady, stripeWebhookClient } from '../lib/stripeWebhook.js';

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

async function personForPortal(request) {
  const caller = portalCaller(request);
  const person = await getStore().getPersonByEmail(caller.email);
  return { caller, person };
}

app.http('portalMe', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'portal/me',
  handler: wrap(async (request) => {
    const { person } = await personForPortal(request);
    return jsonOk({ person });
  }),
});

app.http('portalLease', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'portal/lease',
  handler: wrap(async (request) => {
    const { person } = await personForPortal(request);
    if (!person) return jsonOk({ lease: null });
    const leases = await getStore().getLeasesForPerson(person.id);
    const lease = leases.find((row) => row.status === 'active') || leases[0] || null;
    return jsonOk({ lease, person });
  }),
});

app.http('portalLeaseDocument', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'portal/lease/document',
  handler: wrap(async (request) => {
    const { person } = await personForPortal(request);
    if (!person) {
      const err = new Error('No renter record is on file for this sign-in.');
      err.name = 'NotFoundError';
      throw err;
    }
    const leases = await getStore().getLeasesForPerson(person.id);
    const lease = leases.find((row) => row.status === 'active') || leases[0] || null;
    if (!lease) {
      const err = new Error('No lease is on file for this sign-in.');
      err.name = 'NotFoundError';
      throw err;
    }
    const document = buildLeaseDocument({ lease, person });
    const download = new URL(request.url).searchParams.get('download') === '1';
    return htmlOk(document.html, { filename: document.filename, download });
  }),
});

app.http('portalInvoices', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'portal/invoices',
  handler: wrap(async (request) => {
    const { person } = await personForPortal(request);
    if (!person) return jsonOk({ invoices: [] });
    const store = getStore();
    const leases = await store.getLeasesForPerson(person.id);
    const invoices = (await store.listInvoices())
      .filter((invoice) => invoiceOwnedByPerson(invoice, leases, person.id))
      .map((invoice) => ({ ...invoice, remainingCents: invoiceRemainingCents(invoice) }));
    return jsonOk({ invoices });
  }),
});

async function activeLeaseForPortal(request) {
  const { person } = await personForPortal(request);
  if (!person) return { person: null, lease: null };
  const leases = await getStore().getLeasesForPerson(person.id);
  return { person, lease: leases.find((row) => row.status === 'active') || null };
}

app.http('portalBalance', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'portal/balance',
  handler: wrap(async (request) => {
    const { lease } = await activeLeaseForPortal(request);
    const paymentsEnabled = stripeReady();
    if (!lease) return jsonOk({ lease: null, paymentsEnabled });
    const store = getStore();
    const [invoices, checkouts] = await Promise.all([store.listInvoices(), store.listPaymentCheckouts(lease.id)]);
    const balance = computeLeaseBalance(lease, invoices, checkouts);
    return jsonOk({
      paymentsEnabled,
      minimumPaymentCents: MIN_PARTIAL_PAYMENT_CENTS,
      ...balance,
      lateFee: lateFeeNotice(lease, invoices, checkouts),
    });
  }),
});

app.http('portalPaymentCheckout', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'portal/payments/checkout',
  handler: wrap(async (request) => {
    if (!stripeReady()) {
      const err = new Error('Online payments are not available yet. Contact the office to pay.');
      err.name = 'ConflictError';
      throw err;
    }
    const { person, lease } = await activeLeaseForPortal(request);
    if (!person || !lease) {
      const err = new Error('No active lease is on file for this sign-in.');
      err.name = 'NotFoundError';
      throw err;
    }
    const body = z.object({ amountCents: z.number().int().positive() }).parse(await request.json());
    const checkout = await createRentCheckout({
      stripe: stripeWebhookClient(process.env.STRIPE_SECRET_KEY),
      store: getStore(),
      person,
      lease,
      amountCents: body.amountCents,
      siteUrl: process.env.SITE_URL || 'https://westcherokee.com',
    });
    return jsonOk({ url: checkout.url }, 201);
  }),
});

app.http('portalRequestsGet', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'portal/service-requests',
  handler: wrap(async (request) => {
    const { person } = await personForPortal(request);
    if (!person) return jsonOk({ requests: [] });
    const requests = (await getStore().listServiceRequests()).filter((row) =>
      requestOwnedByPerson(row, person.id),
    );
    return jsonOk({ requests });
  }),
});

app.http('portalRequestsPost', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'portal/service-requests',
  handler: wrap(async (request) => {
    const { person } = await personForPortal(request);
    if (!person) {
      const err = new Error('No renter record is on file for this sign-in.');
      err.name = 'NotFoundError';
      throw err;
    }
    const body = z
      .object({
        title: z.string().trim().min(1).max(200),
        details: z.string().trim().min(1).max(4000),
      })
      .parse(await request.json());
    const leases = await getStore().getLeasesForPerson(person.id);
    const active = leases.find((row) => row.status === 'active');
    const created = await getStore().createServiceRequest({
      personId: person.id,
      unitId: active?.unitId || null,
      title: body.title,
      details: body.details,
    });
    return jsonOk({ request: created }, 201);
  }),
});
