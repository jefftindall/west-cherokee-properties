-- West Cherokee Properties operational schema (Azure SQL).
-- Applied by api/src/lib/sqlStore.js on first connect when tables are missing.

IF OBJECT_ID('dbo.properties', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.properties (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    slug NVARCHAR(64) NOT NULL UNIQUE,
    title NVARCHAR(200) NOT NULL,
    city NVARCHAR(100) NOT NULL,
    state NVARCHAR(8) NOT NULL,
    address NVARCHAR(300) NOT NULL
  );
END;

IF OBJECT_ID('dbo.units', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.units (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    property_id NVARCHAR(64) NOT NULL REFERENCES dbo.properties(id),
    label NVARCHAR(40) NOT NULL,
    bedrooms INT NOT NULL,
    bathrooms INT NOT NULL CONSTRAINT df_units_bathrooms DEFAULT 1,
    UNIQUE (property_id, label)
  );
END;

IF COL_LENGTH('dbo.units', 'bathrooms') IS NULL
BEGIN
  ALTER TABLE dbo.units ADD bathrooms INT NOT NULL CONSTRAINT df_units_bathrooms DEFAULT 1;
END;

IF OBJECT_ID('dbo.people', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.people (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    display_name NVARCHAR(200) NOT NULL,
    email NVARCHAR(320) NOT NULL,
    email_key NVARCHAR(320) NOT NULL UNIQUE,
    phone NVARCHAR(40) NULL
  );
END;

IF OBJECT_ID('dbo.office_users', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.office_users (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    user_id NVARCHAR(200) NOT NULL,
    user_details NVARCHAR(320) NULL,
    emails_json NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    roles_json NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    extra_permissions_json NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    denied_permissions_json NVARCHAR(MAX) NOT NULL DEFAULT '[]',
    status NVARCHAR(20) NOT NULL DEFAULT 'active'
  );
END;

IF OBJECT_ID('dbo.applications', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.applications (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    property_slug NVARCHAR(64) NOT NULL,
    full_name NVARCHAR(200) NOT NULL,
    email NVARCHAR(320) NOT NULL,
    phone NVARCHAR(40) NOT NULL,
    desired_move_in DATE NOT NULL,
    household_size INT NOT NULL,
    notes NVARCHAR(MAX) NULL,
    status NVARCHAR(32) NOT NULL,
    person_id NVARCHAR(64) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.leases', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.leases (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    unit_id NVARCHAR(64) NOT NULL REFERENCES dbo.units(id),
    person_id NVARCHAR(64) NOT NULL REFERENCES dbo.people(id),
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    rent_cents INT NOT NULL,
    status NVARCHAR(32) NOT NULL,
    terms_json NVARCHAR(MAX) NULL
  );
  CREATE UNIQUE INDEX ux_leases_one_active_unit
    ON dbo.leases(unit_id)
    WHERE status = 'active';
END;

IF COL_LENGTH('dbo.leases', 'terms_json') IS NULL
BEGIN
  ALTER TABLE dbo.leases ADD terms_json NVARCHAR(MAX) NULL;
END;

IF OBJECT_ID('dbo.invoices', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.invoices (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    lease_id NVARCHAR(64) NOT NULL REFERENCES dbo.leases(id),
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    amount_cents INT NOT NULL,
    status NVARCHAR(32) NOT NULL,
    stripe_invoice_id NVARCHAR(64) NULL,
    hosted_invoice_url NVARCHAR(500) NULL,
    receipt_url NVARCHAR(500) NULL
  );
END;

IF OBJECT_ID('dbo.payments', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.payments (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    invoice_id NVARCHAR(64) NOT NULL REFERENCES dbo.invoices(id),
    amount_cents INT NOT NULL,
    stripe_event_id NVARCHAR(64) NULL,
    stripe_payment_intent_id NVARCHAR(64) NULL,
    receipt_url NVARCHAR(500) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;

IF OBJECT_ID('dbo.service_requests', 'U') IS NULL
BEGIN
  CREATE TABLE dbo.service_requests (
    id NVARCHAR(64) NOT NULL PRIMARY KEY,
    person_id NVARCHAR(64) NOT NULL REFERENCES dbo.people(id),
    unit_id NVARCHAR(64) NULL,
    title NVARCHAR(200) NOT NULL,
    details NVARCHAR(MAX) NOT NULL,
    status NVARCHAR(32) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END;
