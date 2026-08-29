import { randomUUID } from 'node:crypto';
import { APPLICATION_STATUSES, normalizeApplication } from './applications.js';
import { assertUnitVacant, normalizeLease } from './leases.js';
import { normalizeInvoice } from './invoices.js';
import { normalizeServiceRequest } from './serviceRequests.js';
import { ROLE } from './permissions.js';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { createSqlStore } from './sqlStore.js';
import { SEEDED_PROPERTIES, SEEDED_UNITS } from './propertySeed.js';

export { ConflictError, NotFoundError, ValidationError } from './errors.js';

function clone(value) {
  return structuredClone(value);
}

export function createMemoryStore() {
  const db = {
    properties: clone(SEEDED_PROPERTIES),
    units: clone(SEEDED_UNITS),
    people: [],
    officeUsers: [],
    applications: [],
    leases: [],
    invoices: [],
    payments: [],
    serviceRequests: [],
  };

  return {
    kind: 'memory',
    listProperties: async () => clone(db.properties),
    listUnits: async (propertyId) =>
      clone(propertyId ? db.units.filter((u) => u.propertyId === propertyId) : db.units),
    getUnit: async (id) => clone(db.units.find((u) => u.id === id) || null),

    async upsertPerson({ displayName, email, phone = '' }) {
      const emailKey = String(email || '').trim().toLowerCase();
      if (!emailKey) throw new ValidationError('email is required');
      let person = db.people.find((p) => p.emailKey === emailKey);
      if (!person) {
        person = {
          id: `person-${randomUUID()}`,
          displayName: String(displayName || '').trim(),
          email: String(email).trim(),
          emailKey,
          phone: String(phone || '').trim(),
        };
        db.people.push(person);
      } else {
        person.displayName = String(displayName || person.displayName).trim();
        if (phone) person.phone = String(phone).trim();
      }
      return clone(person);
    },
    listPeople: async () => clone(db.people),
    getPersonByEmail: async (email) => {
      const emailKey = String(email || '').trim().toLowerCase();
      return clone(db.people.find((p) => p.emailKey === emailKey) || null);
    },
    getPerson: async (id) => clone(db.people.find((p) => p.id === id) || null),

    async createApplication(input) {
      const row = normalizeApplication({ ...input, id: `app-${randomUUID()}`, status: 'submitted' });
      db.applications.push(row);
      return clone(row);
    },
    listApplications: async () => clone(db.applications),
    getApplication: async (id) => clone(db.applications.find((a) => a.id === id) || null),
    async updateApplicationStatus(id, status, extras = {}) {
      const row = db.applications.find((a) => a.id === id);
      if (!row) throw new NotFoundError('Application not found.');
      if (!APPLICATION_STATUSES.includes(status)) throw new ValidationError('Unknown application status.');
      row.status = status;
      Object.assign(row, extras);
      return clone(row);
    },

    async createLease(input) {
      const row = normalizeLease({ ...input, id: input.id || `lease-${randomUUID()}`, status: input.status || 'active' });
      assertUnitVacant(db.leases, row.unitId, row.id);
      if (!db.units.some((u) => u.id === row.unitId)) throw new NotFoundError('Unit not found.');
      db.leases.push(row);
      return clone(row);
    },
    listLeases: async () => clone(db.leases),
    getLease: async (id) => clone(db.leases.find((l) => l.id === id) || null),
    getActiveLeaseForUnit: async (unitId) =>
      clone(db.leases.find((l) => l.unitId === unitId && l.status === 'active') || null),
    getLeasesForPerson: async (personId) => clone(db.leases.filter((l) => l.personId === personId)),

    async createInvoice(input) {
      const row = normalizeInvoice({ ...input, id: input.id || `inv-${randomUUID()}`, status: input.status || 'open' });
      if (!db.leases.some((l) => l.id === row.leaseId)) throw new NotFoundError('Lease not found.');
      const dup = db.invoices.find(
        (i) => i.leaseId === row.leaseId && i.periodStart === row.periodStart && i.periodEnd === row.periodEnd,
      );
      if (dup) throw new ConflictError('An invoice already exists for that period.');
      db.invoices.push(row);
      return clone(row);
    },
    listInvoices: async () => clone(db.invoices),
    getInvoice: async (id) => clone(db.invoices.find((i) => i.id === id) || null),
    getInvoiceByStripeId: async (stripeInvoiceId) =>
      clone(db.invoices.find((i) => i.stripeInvoiceId === stripeInvoiceId) || null),
    async updateInvoice(id, patch) {
      const row = db.invoices.find((i) => i.id === id);
      if (!row) throw new NotFoundError('Invoice not found.');
      Object.assign(row, patch);
      return clone(row);
    },
    async createPayment(input) {
      const payment = {
        id: input.id || `pay-${randomUUID()}`,
        invoiceId: input.invoiceId,
        amountCents: Number(input.amountCents),
        stripeEventId: input.stripeEventId || '',
        stripePaymentIntentId: input.stripePaymentIntentId || '',
        receiptUrl: input.receiptUrl || '',
        createdAt: input.createdAt || new Date().toISOString(),
      };
      if (payment.stripeEventId && db.payments.some((p) => p.stripeEventId === payment.stripeEventId)) {
        return clone(db.payments.find((p) => p.stripeEventId === payment.stripeEventId));
      }
      db.payments.push(payment);
      return clone(payment);
    },
    listPayments: async (invoiceId) =>
      clone(invoiceId ? db.payments.filter((p) => p.invoiceId === invoiceId) : db.payments),

    async createServiceRequest(input) {
      const row = normalizeServiceRequest({
        ...input,
        id: input.id || `sr-${randomUUID()}`,
        status: input.status || 'open',
      });
      db.serviceRequests.push(row);
      return clone(row);
    },
    listServiceRequests: async () => clone(db.serviceRequests),
    getServiceRequest: async (id) => clone(db.serviceRequests.find((r) => r.id === id) || null),
    async updateServiceRequest(id, patch) {
      const row = db.serviceRequests.find((r) => r.id === id);
      if (!row) throw new NotFoundError('Service request not found.');
      Object.assign(row, patch);
      return clone(row);
    },

    listOfficeUsers: async () => clone(db.officeUsers),
    async upsertOfficeUser(input) {
      const emails = Array.isArray(input.emails) ? input.emails : [];
      let row = db.officeUsers.find(
        (u) =>
          String(u.userId).toLowerCase() === String(input.userId || '').toLowerCase() ||
          emails.some((e) => (u.emails || []).map((x) => x.toLowerCase()).includes(String(e).toLowerCase())),
      );
      if (!row) {
        row = {
          id: input.id || `ou-${randomUUID()}`,
          userId: input.userId,
          userDetails: input.userDetails || '',
          emails,
          roles: input.roles || [ROLE.PROPERTY_MANAGER],
          extraPermissions: input.extraPermissions || [],
          deniedPermissions: input.deniedPermissions || [],
          status: input.status || 'active',
        };
        db.officeUsers.push(row);
      } else {
        Object.assign(row, input, { emails: emails.length ? emails : row.emails });
      }
      return clone(row);
    },
  };
}

let singleton;

export function getStore() {
  if (!singleton) {
    const sql = String(process.env.SQL_CONNECTION_STRING || '').trim();
    singleton = sql && sql !== 'REPLACE_ME' ? createSqlStore(sql) : createMemoryStore();
  }
  return singleton;
}

export function resetStoreForTests(store) {
  singleton = store || createMemoryStore();
  return singleton;
}

export function setStore(store) {
  singleton = store;
  return singleton;
}
