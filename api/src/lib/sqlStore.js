import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { ConflictError, NotFoundError, ValidationError } from './errors.js';
import { APPLICATION_STATUSES, normalizeApplication } from './applications.js';
import { assertUnitVacant, normalizeLease } from './leases.js';
import { normalizeInvoice } from './invoices.js';
import { normalizeServiceRequest } from './serviceRequests.js';
import { ROLE } from './permissions.js';
import { SEEDED_PROPERTIES, SEEDED_UNITS } from './propertySeed.js';

const schemaPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '../db/schema.sql');

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

export function createSqlStore(connectionString) {
  let poolPromise;

  async function pool() {
    if (!poolPromise) {
      poolPromise = sql.connect(connectionString).then(async (connected) => {
        const schema = fs.readFileSync(schemaPath, 'utf8');
        await connected.request().batch(schema);
        await seedIfEmpty(connected);
        return connected;
      });
    }
    return poolPromise;
  }

  async function seedIfEmpty(connected) {
    const count = await connected.request().query('SELECT COUNT(*) AS n FROM dbo.properties');
    if (count.recordset[0].n > 0) return;
    const propertyValues = SEEDED_PROPERTIES.map(
      (p) =>
        `('${p.id}', '${p.slug}', '${p.title.replaceAll("'", "''")}', '${p.city}', '${p.state}', '${p.address.replaceAll("'", "''")}')`,
    ).join(',\n      ');
    const unitValues = SEEDED_UNITS.map(
      (u) =>
        `('${u.id}', '${u.propertyId}', '${u.label.replaceAll("'", "''")}', ${u.bedrooms}, ${u.bathrooms}, ${u.available ? 1 : 0})`,
    ).join(',\n      ');
    await connected.request().query(`
      INSERT INTO dbo.properties (id, slug, title, city, state, address) VALUES
      ${propertyValues};
      INSERT INTO dbo.units (id, property_id, label, bedrooms, bathrooms, available) VALUES
      ${unitValues};
    `);
  }

  return {
    kind: 'sql',
    async listProperties() {
      const p = await pool();
      const result = await p.request().query('SELECT id, slug, title, city, state, address FROM dbo.properties');
      return result.recordset;
    },
    async listUnits(propertyId) {
      const p = await pool();
      const req = p.request();
      const result = propertyId
        ? await req.input('propertyId', sql.NVarChar, propertyId).query(
            'SELECT id, property_id AS propertyId, label, bedrooms, bathrooms, available FROM dbo.units WHERE property_id = @propertyId',
          )
        : await req.query(
            'SELECT id, property_id AS propertyId, label, bedrooms, bathrooms, available FROM dbo.units',
          );
      return result.recordset.map((row) => ({ ...row, available: Boolean(row.available) }));
    },
    async getUnit(id) {
      const p = await pool();
      const result = await p
        .request()
        .input('id', sql.NVarChar, id)
        .query(
          'SELECT id, property_id AS propertyId, label, bedrooms, bathrooms, available FROM dbo.units WHERE id = @id',
        );
      const row = result.recordset[0] || null;
      return row ? { ...row, available: Boolean(row.available) } : null;
    },
    async updateUnit(id, patch) {
      const current = await this.getUnit(id);
      if (!current) throw new NotFoundError('Unit not found.');
      const available = patch.available != null ? Boolean(patch.available) : current.available;
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('available', sql.Bit, available ? 1 : 0)
        .query('UPDATE dbo.units SET available = @available WHERE id = @id');
      return { ...current, available };
    },
    async upsertPerson({ displayName, email, phone = '' }) {
      const emailKey = String(email || '').trim().toLowerCase();
      if (!emailKey) throw new ValidationError('email is required');
      const p = await pool();
      const existing = await p
        .request()
        .input('emailKey', sql.NVarChar, emailKey)
        .query(
          'SELECT id, display_name AS displayName, email, email_key AS emailKey, phone, stripe_customer_id AS stripeCustomerId FROM dbo.people WHERE email_key = @emailKey',
        );
      if (existing.recordset[0]) {
        await p
          .request()
          .input('id', sql.NVarChar, existing.recordset[0].id)
          .input('displayName', sql.NVarChar, displayName)
          .input('phone', sql.NVarChar, phone)
          .query('UPDATE dbo.people SET display_name = @displayName, phone = @phone WHERE id = @id');
        return { ...existing.recordset[0], displayName, phone, stripeCustomerId: existing.recordset[0].stripeCustomerId || '' };
      }
      const id = `person-${randomUUID()}`;
      await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('displayName', sql.NVarChar, displayName)
        .input('email', sql.NVarChar, email)
        .input('emailKey', sql.NVarChar, emailKey)
        .input('phone', sql.NVarChar, phone)
        .query(
          'INSERT INTO dbo.people (id, display_name, email, email_key, phone) VALUES (@id, @displayName, @email, @emailKey, @phone)',
        );
      return { id, displayName, email, emailKey, phone, stripeCustomerId: '' };
    },
    async listPeople() {
      const p = await pool();
      const result = await p
        .request()
        .query(
          'SELECT id, display_name AS displayName, email, email_key AS emailKey, phone, stripe_customer_id AS stripeCustomerId FROM dbo.people',
        );
      return result.recordset;
    },
    async getPersonByEmail(email) {
      const p = await pool();
      const result = await p
        .request()
        .input('emailKey', sql.NVarChar, String(email || '').trim().toLowerCase())
        .query(
          'SELECT id, display_name AS displayName, email, email_key AS emailKey, phone, stripe_customer_id AS stripeCustomerId FROM dbo.people WHERE email_key = @emailKey',
        );
      return result.recordset[0] || null;
    },
    async getPerson(id) {
      const p = await pool();
      const result = await p
        .request()
        .input('id', sql.NVarChar, id)
        .query(
          'SELECT id, display_name AS displayName, email, email_key AS emailKey, phone, stripe_customer_id AS stripeCustomerId FROM dbo.people WHERE id = @id',
        );
      return result.recordset[0] || null;
    },
    async updatePersonStripeCustomerId(id, stripeCustomerId) {
      const current = await this.getPerson(id);
      if (!current) throw new NotFoundError('Person not found.');
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('stripeCustomerId', sql.NVarChar, String(stripeCustomerId || '').trim())
        .query('UPDATE dbo.people SET stripe_customer_id = @stripeCustomerId WHERE id = @id');
      return { ...current, stripeCustomerId: String(stripeCustomerId || '').trim() };
    },
    async createApplication(input) {
      const row = normalizeApplication({ ...input, id: `app-${randomUUID()}`, status: 'submitted' });
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, row.id)
        .input('propertySlug', sql.NVarChar, row.propertySlug)
        .input('fullName', sql.NVarChar, row.fullName)
        .input('email', sql.NVarChar, row.email)
        .input('phone', sql.NVarChar, row.phone)
        .input('desiredMoveIn', sql.Date, row.desiredMoveIn)
        .input('householdSize', sql.Int, row.householdSize)
        .input('notes', sql.NVarChar, row.notes)
        .input('status', sql.NVarChar, row.status)
        .query(
          `INSERT INTO dbo.applications (id, property_slug, full_name, email, phone, desired_move_in, household_size, notes, status)
           VALUES (@id, @propertySlug, @fullName, @email, @phone, @desiredMoveIn, @householdSize, @notes, @status)`,
        );
      return row;
    },
    async listApplications() {
      const p = await pool();
      const result = await p.request().query(`
        SELECT id, property_slug AS propertySlug, full_name AS fullName, email, phone,
               CONVERT(char(10), desired_move_in, 23) AS desiredMoveIn, household_size AS householdSize,
               notes, status, person_id AS personId, created_at AS createdAt
        FROM dbo.applications ORDER BY created_at DESC`);
      return result.recordset;
    },
    async getApplication(id) {
      const rows = await this.listApplications();
      return rows.find((row) => row.id === id) || null;
    },
    async updateApplicationStatus(id, status, extras = {}) {
      if (!APPLICATION_STATUSES.includes(status)) throw new ValidationError('Unknown application status.');
      const p = await pool();
      const result = await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('status', sql.NVarChar, status)
        .input('personId', sql.NVarChar, extras.personId || null)
        .query('UPDATE dbo.applications SET status = @status, person_id = COALESCE(@personId, person_id) WHERE id = @id');
      if (!result.rowsAffected[0]) throw new NotFoundError('Application not found.');
      return this.getApplication(id);
    },
    async createLease(input) {
      const row = normalizeLease({ ...input, id: input.id || `lease-${randomUUID()}`, status: input.status || 'active' });
      const existing = await this.listLeases();
      assertUnitVacant(existing, row.unitId, row.id);
      const p = await pool();
      try {
        await p
          .request()
          .input('id', sql.NVarChar, row.id)
          .input('unitId', sql.NVarChar, row.unitId)
          .input('personId', sql.NVarChar, row.personId)
          .input('startDate', sql.Date, row.startDate)
          .input('endDate', sql.Date, row.endDate)
          .input('rentCents', sql.Int, row.rentCents)
          .input('status', sql.NVarChar, row.status)
          .input('termsJson', sql.NVarChar, JSON.stringify(row.terms || {}))
          .query(
            `INSERT INTO dbo.leases (id, unit_id, person_id, start_date, end_date, rent_cents, status, terms_json)
             VALUES (@id, @unitId, @personId, @startDate, @endDate, @rentCents, @status, @termsJson)`,
          );
      } catch (err) {
        if (String(err.message || '').includes('ux_leases_one_active_unit')) {
          throw new ConflictError('That unit already has an active lease.');
        }
        throw err;
      }
      return row;
    },
    async updateLease(id, patch) {
      const existing = await this.getLease(id);
      if (!existing) throw new NotFoundError('Lease not found.');
      const row = normalizeLease({
        ...existing,
        ...patch,
        id,
        terms: { ...existing.terms, ...patch.terms },
      });
      const p = await pool();
      const result = await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('startDate', sql.Date, row.startDate)
        .input('endDate', sql.Date, row.endDate)
        .input('rentCents', sql.Int, row.rentCents)
        .input('status', sql.NVarChar, row.status)
        .input('termsJson', sql.NVarChar, JSON.stringify(row.terms || {}))
        .query(
          `UPDATE dbo.leases SET start_date = @startDate, end_date = @endDate, rent_cents = @rentCents,
           status = @status, terms_json = @termsJson WHERE id = @id`,
        );
      if (!result.rowsAffected[0]) throw new NotFoundError('Lease not found.');
      return row;
    },
    async listLeases() {
      const p = await pool();
      const result = await p.request().query(`
        SELECT id, unit_id AS unitId, person_id AS personId,
               CONVERT(char(10), start_date, 23) AS startDate,
               CONVERT(char(10), end_date, 23) AS endDate,
               rent_cents AS rentCents, status, terms_json AS termsJson
        FROM dbo.leases`);
      return result.recordset.map(({ termsJson, ...row }) => ({
        ...row,
        terms: parseJson(termsJson, {}),
      }));
    },
    async getLease(id) {
      const rows = await this.listLeases();
      return rows.find((row) => row.id === id) || null;
    },
    async getActiveLeaseForUnit(unitId) {
      const rows = await this.listLeases();
      return rows.find((row) => row.unitId === unitId && row.status === 'active') || null;
    },
    async getLeasesForPerson(personId) {
      const rows = await this.listLeases();
      return rows.filter((row) => row.personId === personId);
    },
    async createInvoice(input) {
      const row = normalizeInvoice({ ...input, id: input.id || `inv-${randomUUID()}`, status: input.status || 'open' });
      const p = await pool();
      const dup = await p
        .request()
        .input('leaseId', sql.NVarChar, row.leaseId)
        .input('periodStart', sql.Date, row.periodStart)
        .input('periodEnd', sql.Date, row.periodEnd)
        .query(
          'SELECT id FROM dbo.invoices WHERE lease_id = @leaseId AND period_start = @periodStart AND period_end = @periodEnd',
        );
      if (dup.recordset[0]) throw new ConflictError('An invoice already exists for that period.');
      await p
        .request()
        .input('id', sql.NVarChar, row.id)
        .input('leaseId', sql.NVarChar, row.leaseId)
        .input('periodStart', sql.Date, row.periodStart)
        .input('periodEnd', sql.Date, row.periodEnd)
        .input('amountCents', sql.Int, row.amountCents)
        .input('status', sql.NVarChar, row.status)
        .query(
          `INSERT INTO dbo.invoices (id, lease_id, period_start, period_end, amount_cents, status)
           VALUES (@id, @leaseId, @periodStart, @periodEnd, @amountCents, @status)`,
        );
      return row;
    },
    async listInvoices() {
      const p = await pool();
      const result = await p.request().query(`
        SELECT id, lease_id AS leaseId,
               CONVERT(char(10), period_start, 23) AS periodStart,
               CONVERT(char(10), period_end, 23) AS periodEnd,
               amount_cents AS amountCents, status,
               stripe_invoice_id AS stripeInvoiceId,
               hosted_invoice_url AS hostedInvoiceUrl,
               receipt_url AS receiptUrl
        FROM dbo.invoices`);
      return result.recordset;
    },
    async getInvoice(id) {
      const rows = await this.listInvoices();
      return rows.find((row) => row.id === id) || null;
    },
    async getInvoiceByStripeId(stripeInvoiceId) {
      const rows = await this.listInvoices();
      return rows.find((row) => row.stripeInvoiceId === stripeInvoiceId) || null;
    },
    async updateInvoice(id, patch) {
      const current = await this.getInvoice(id);
      if (!current) throw new NotFoundError('Invoice not found.');
      const next = { ...current, ...patch };
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('status', sql.NVarChar, next.status)
        .input('stripeInvoiceId', sql.NVarChar, next.stripeInvoiceId || '')
        .input('hostedInvoiceUrl', sql.NVarChar, next.hostedInvoiceUrl || '')
        .input('receiptUrl', sql.NVarChar, next.receiptUrl || '')
        .query(
          `UPDATE dbo.invoices SET status = @status, stripe_invoice_id = @stripeInvoiceId,
           hosted_invoice_url = @hostedInvoiceUrl, receipt_url = @receiptUrl WHERE id = @id`,
        );
      return next;
    },
    async createPayment(input) {
      const p = await pool();
      if (input.stripeEventId) {
        const existing = await p
          .request()
          .input('stripeEventId', sql.NVarChar, input.stripeEventId)
          .query('SELECT id FROM dbo.payments WHERE stripe_event_id = @stripeEventId');
        if (existing.recordset[0]) {
          return { id: existing.recordset[0].id, ...input };
        }
      }
      const id = input.id || `pay-${randomUUID()}`;
      await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('invoiceId', sql.NVarChar, input.invoiceId)
        .input('amountCents', sql.Int, input.amountCents)
        .input('stripeEventId', sql.NVarChar, input.stripeEventId || '')
        .input('stripePaymentIntentId', sql.NVarChar, input.stripePaymentIntentId || '')
        .input('receiptUrl', sql.NVarChar, input.receiptUrl || '')
        .query(
          `INSERT INTO dbo.payments (id, invoice_id, amount_cents, stripe_event_id, stripe_payment_intent_id, receipt_url)
           VALUES (@id, @invoiceId, @amountCents, @stripeEventId, @stripePaymentIntentId, @receiptUrl)`,
        );
      return { id, ...input };
    },
    async listPayments(invoiceId) {
      const p = await pool();
      const req = p.request();
      const result = invoiceId
        ? await req.input('invoiceId', sql.NVarChar, invoiceId).query(
            `SELECT id, invoice_id AS invoiceId, amount_cents AS amountCents, stripe_event_id AS stripeEventId,
                    stripe_payment_intent_id AS stripePaymentIntentId, receipt_url AS receiptUrl, created_at AS createdAt
             FROM dbo.payments WHERE invoice_id = @invoiceId`,
          )
        : await req.query(
            `SELECT id, invoice_id AS invoiceId, amount_cents AS amountCents, stripe_event_id AS stripeEventId,
                    stripe_payment_intent_id AS stripePaymentIntentId, receipt_url AS receiptUrl, created_at AS createdAt
             FROM dbo.payments`,
          );
      return result.recordset;
    },
    async createServiceRequest(input) {
      const row = normalizeServiceRequest({
        ...input,
        id: input.id || `sr-${randomUUID()}`,
        status: input.status || 'open',
      });
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, row.id)
        .input('personId', sql.NVarChar, row.personId)
        .input('unitId', sql.NVarChar, row.unitId)
        .input('title', sql.NVarChar, row.title)
        .input('details', sql.NVarChar, row.details)
        .input('status', sql.NVarChar, row.status)
        .query(
          `INSERT INTO dbo.service_requests (id, person_id, unit_id, title, details, status)
           VALUES (@id, @personId, @unitId, @title, @details, @status)`,
        );
      return row;
    },
    async listServiceRequests() {
      const p = await pool();
      const result = await p.request().query(`
        SELECT id, person_id AS personId, unit_id AS unitId, title, details, status, created_at AS createdAt
        FROM dbo.service_requests ORDER BY created_at DESC`);
      return result.recordset;
    },
    async getServiceRequest(id) {
      const rows = await this.listServiceRequests();
      return rows.find((row) => row.id === id) || null;
    },
    async updateServiceRequest(id, patch) {
      const current = await this.getServiceRequest(id);
      if (!current) throw new NotFoundError('Service request not found.');
      const next = { ...current, ...patch };
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, id)
        .input('status', sql.NVarChar, next.status)
        .query('UPDATE dbo.service_requests SET status = @status WHERE id = @id');
      return next;
    },
    async listOfficeUsers() {
      const p = await pool();
      const result = await p.request().query(`
        SELECT id, user_id AS userId, user_details AS userDetails, emails_json, roles_json,
               extra_permissions_json, denied_permissions_json, status
        FROM dbo.office_users`);
      return result.recordset.map((row) => ({
        id: row.id,
        userId: row.userId,
        userDetails: row.userDetails,
        emails: parseJson(row.emails_json, []),
        roles: parseJson(row.roles_json, []),
        extraPermissions: parseJson(row.extra_permissions_json, []),
        deniedPermissions: parseJson(row.denied_permissions_json, []),
        status: row.status,
      }));
    },
    async upsertOfficeUser(input) {
      const existing = (await this.listOfficeUsers()).find(
        (u) => String(u.userId).toLowerCase() === String(input.userId || '').toLowerCase(),
      );
      const row = {
        id: existing?.id || input.id || `ou-${randomUUID()}`,
        userId: input.userId,
        userDetails: input.userDetails || existing?.userDetails || '',
        emails: input.emails || existing?.emails || [],
        roles: input.roles || existing?.roles || [ROLE.PROPERTY_MANAGER],
        extraPermissions: input.extraPermissions || existing?.extraPermissions || [],
        deniedPermissions: input.deniedPermissions || existing?.deniedPermissions || [],
        status: input.status || existing?.status || 'active',
      };
      const p = await pool();
      await p
        .request()
        .input('id', sql.NVarChar, row.id)
        .input('userId', sql.NVarChar, row.userId)
        .input('userDetails', sql.NVarChar, row.userDetails)
        .input('emails', sql.NVarChar, JSON.stringify(row.emails))
        .input('roles', sql.NVarChar, JSON.stringify(row.roles))
        .input('extra', sql.NVarChar, JSON.stringify(row.extraPermissions))
        .input('denied', sql.NVarChar, JSON.stringify(row.deniedPermissions))
        .input('status', sql.NVarChar, row.status)
        .query(
          `MERGE dbo.office_users AS t
           USING (SELECT @id AS id) AS s ON t.id = s.id
           WHEN MATCHED THEN UPDATE SET user_id = @userId, user_details = @userDetails, emails_json = @emails,
             roles_json = @roles, extra_permissions_json = @extra, denied_permissions_json = @denied, status = @status
           WHEN NOT MATCHED THEN INSERT (id, user_id, user_details, emails_json, roles_json, extra_permissions_json, denied_permissions_json, status)
             VALUES (@id, @userId, @userDetails, @emails, @roles, @extra, @denied, @status);`,
        );
      return row;
    },
  };
}
