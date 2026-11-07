# Office operations portal

**Audience:** Agents, implementers  
**Last updated:** 2026-11-07  
**Status:** in_progress (phase 2 complete)  
**Depends on:** phases 7–9 (leases, payments, service requests), ACS email, [`lease-esign.md`](./lease-esign.md) for executed renewals, [`data-persistence.md`](../architecture/data-persistence.md)

Extend `/office` from thin CRUD into an operational portal: property dashboard with unit health (green / yellow / red), automated rent billing and tenant communications, lease renewal workflow starting 90 days before expiration, structured rent increases, service-request cost tracking, weekly staff digest emails, and workflow monitoring with SMS paging. Azure SQL is the single source of truth for charges, payments, and balances; Stripe only processes payments.

## Unit health (R/Y/G)

Rent due **1st of month**, **3-day grace**, **$50 late fee** ([`leaseTerms.js`](../../api/src/lib/leaseTerms.js), [`docs/legal/README.md`](../legal/README.md)).

| Status | Rule |
|--------|------|
| **Green** | Active lease + current-month charges fully paid + no prior-month arrears |
| **Yellow** | Active lease + only the current month unpaid + within grace (2nd–4th) |
| **Red** | Prior-month arrears (open or missing), or current month unpaid after grace with late fee applied |
| **Vacant** | No active lease (neutral, not R/Y/G) |

Health is **computed** from invoice/payment state (America/New_York), not stored as a separate score.

## Staff data management

Operational data is entered in the office UI; automations read Azure SQL. Staff never edit Stripe for routine rent amounts.

| Concern | Store | Staff enters via |
|---------|-------|------------------|
| Marketing copy | Git | PR |
| Unit availability | SQL `units.available` (new) | Office unit toggle at turnover |
| Applications / leases / rent schedule | SQL | `/office/applications`, `/office/renters`, `/office/leases` (create, edit, end) |
| Charges / payments / balances | SQL (single source of truth) | Portal pay through Stripe Checkout, applied automatically; **manual** cash/check/Zelle (full or partial) via `/office/payments` |
| Service request cost | SQL | Required when closing a request |

**Move-in:** approve application (unit picker, dates, rent) or create lease → rent schedule row(s) → activate → billing automates.  
**Monthly:** dashboard only unless yellow/red.  
**Increase:** add `rent_schedule_entries` at renewal or on multi-year lease.  
**Turnover:** renewal panel or end lease → mark unit available.

### SWA static routing

Site is `output: 'static'`. Do **not** use runtime Astro `[id].astro` for SQL records.

| Pattern | Use |
|---------|-----|
| List + inline panel | Leases, requests on existing pages |
| Static shell + `?query=` | `/office/lease-manage?leaseId=`, `/office/unit?unitId=` |
| SWA rewrite + shell | `/office/leases/lease-*` → print shell (existing) |
| API | All create/update/delete |

**Deep-link auth:** deep-link shells allow anonymous HTML load; client gate redirects to `/login?returnUrl=` (encoded path + query). Login page validates prefix and passes full URL to `post_login_redirect_uri`. See OP-03.

## Actions

| ID | Status | Phase | Work |
|----|--------|-------|------|
| OP-01 | done | 1 | `unitHealth.js` + tests; `GET /api/office/dashboard` |
| OP-02 | done | 1 | Property-centric dashboard UI; unit manage panel or `/office/unit?unitId=` shell |
| OP-03 | done | 1 | Deep-link login: `returnUrl` on `/login`, anonymous shells, Playwright smoke |
| OP-04 | done | 1 | `people.stripe_customer_id`; `units.available` in SQL; apply reads SQL not seed |
| OP-05 | done | 2 | Charge step of timer `rentDailyJobs` — SQL charge 10 days before due; idempotent; no Stripe Invoicing |
| OP-06 | done | 2 | Late-fee step of `rentDailyJobs` (runs first) — $50 fee after grace unless the month is paid in full; deferred while a full bank payment is processing |
| OP-07 | done | 2 | Communications step of `rentDailyJobs` — sole tenant email path; daily send gate |
| OP-23 | done | 2 | Standalone Flex Consumption Function App `func-wcp-jobs-<env>` for timers (SWA managed Functions are HTTP-only); one combined daily run in prod, staging on demand; CD deploys; budget $70 |
| OP-24 | done | 2 | Portal payments: `invoices.paid_cents`, `payment_checkouts`; `GET /api/portal/balance`, `POST /api/portal/payments/checkout`; tenant picks full or partial amount on our site (minimum $100, or full balance if smaller); fixed-amount Stripe Checkout; oldest-first allocation; late-fee policy shown on the page and in emails |
| OP-08 | done | 2 | `tenant_communication_state`, `communication_log`; state-driven messages (no catch-up queue) |
| OP-09 | done | 2 | Comms preview API + flags `RENT_COMMUNICATIONS_*`; emails link to the portal pay page |
| OP-10 | planned | 3 | `lease_renewals` + `rent_schedule_entries`; update data-persistence.md |
| OP-11 | planned | 3 | Lease manage shell `/office/lease-manage?leaseId=` — schedule, renewal, documents |
| OP-12 | planned | 3 | Application approve modal; renewal watcher at 90 days |
| OP-13 | planned | 4 | `service_requests.cost_cents`, `closed_at`; close-with-cost UI |
| OP-14 | planned | 4 | Maintenance report by property |
| OP-15 | planned | 5 | `officeWeeklyDigest` timer; `OFFICE_DIGEST_ENABLED`; PM/super-admin recipients |
| OP-16 | planned | 5 | Digest preview API |
| OP-17 | planned | 6 | `workflow_runs`, `workflow_incidents`; `workflowMonitor.js` on all timers |
| OP-18 | planned | 6 | SMS pager (`ALERT-PHONE`, ACS SMS); hourly repeat max once per 24h per incident |
| OP-19 | planned | 6 | `/office/operations` UI; Azure Monitor backup alerts |
| OP-20 | planned | 6 | Runbook `docs/runbooks/workflow-monitoring.md`; rotate-secrets entry for `ALERT-PHONE` |
| OP-21 | done | 1 | Manual payment entry (`POST /api/office/payments`); dashboard rent roll (current + next month) with progress |
| OP-22 | done | 1 | Unit manage detail — balance due, lease progress, recent payments, open/closed service requests on `/office/unit?unitId=` |
| OP-25 | done | 2 | Invoice scheduler 3-day Eastern lookback; `invoice_notice` eligible in the same window; `billing_source=scheduler` |
| OP-26 | done | 2 | Staff catch-up (`POST /api/office/invoices/catch-up` + `/office/invoices` UI); `billing_source=catchup`; no auto late fee; apologetic `invoice_catchup_notice` |
| OP-27 | done | 2 | Prod Azure Monitor alert when `rentDailyJobs` has no App Insights trace for 48h (email `ALERT-EMAIL`) |
| OP-28 | done | 2 | Runbook [`rent-invoice-catch-up.md`](../runbooks/rent-invoice-catch-up.md) |
| OP-29 | done | 2 | Per-renter `auto_communications_enabled` (default off) + consent UI; auto scheduler gated by consent; one-off balance notice + create/catch-up `notify` (default false) |

Suggested PR sequence: OP-01–04 → OP-05–09 → OP-10–12 → OP-13–14 → OP-15–16 → OP-17–20 (+ Playwright for dashboard, digest preview, deep-link login).

## Billing and tenant communications

| When | Action |
|------|--------|
| 10 days before due (±3 Eastern days if the daily job was missed) | Create the month's charge in SQL (rent + pets, `billing_source=scheduler`); `invoice_notice` email with the total balance and portal link. Late fees still apply after grace. |
| Due (1st) | Comm scheduler: `due_reminder` if unpaid |
| 2nd–4th | Comm scheduler: `grace_warning` (max one email/day) |
| After grace, not paid in full | Late-fee job adds $50 unless `billing_source=catchup` or paid in full (partial payments do not prevent it); comm scheduler: `balance_overdue` |
| Weekly after late fee | `balance_overdue` if ≥7 days since last and gate allows |
| Staff catch-up (outage longer than lookback / missing months) | `POST /api/office/invoices/catch-up` creates missing months as `catchup` (no auto late fee). Optional `notify: true` (default false) sends one apologetic `invoice_catchup_notice` per lease |
| Staff one-off | `POST /api/office/leases/{id}/communications/balance-notice` or create-invoice `notify: true` — does **not** require per-renter auto consent |

**Consent:** `people.auto_communications_enabled` defaults off. Enable only after customer consent (office renters + unit manage UI). Daily auto emails/texts require consent **and** `RENT_COMMUNICATIONS_*`. Preview lists eligible messages with `skippedReason: no_consent` when consent is missing.

**One email per lease per calendar day:** state-driven selection (priority: balance_overdue → grace_warning → due_reminder → invoice_notice). No queue replay after outage. Transactional gate before ACS send; unique constraint on `(lease_id, sent_date)`.

**Portal payments:** tenants choose the amount on `/portal/invoices`, never in Stripe. Minimum $100 (or the full balance when it is under $100), maximum the balance not already processing. The page and the due/grace emails state that the $50 late fee is added unless the full balance is paid by the end of the grace period.

**Feature flags:** `RENT_PAYMENTS_ENABLED` (online payment), `RENT_COMMUNICATIONS_ENABLED` / `RENT_COMMUNICATIONS_PREVIEW` (auto scheduler + preview inbox). One-off staff sends use ACS without requiring `ENABLED`; preview still redirects to `CONTACT_NOTIFY_EMAIL`.

**Hosting:** timers cannot run on SWA managed Functions (HTTP triggers only). All timers live in `api/src/jobs/` and deploy to the standalone jobs Function App ([rent-jobs.md](../runbooks/rent-jobs.md)). Prefer adding steps to an existing daily run over new timers: each separate run wakes Azure SQL serverless for another 60-minute auto-pause window. Future timers (OP-15 digest, OP-17 monitor) follow the same pattern.

## Workflow monitoring

Every timer wrapped in `runMonitoredJob`. Failure or missed run opens `workflow_incidents`. Site admin SMS via `ALERT-PHONE` immediately, then at most once per 24 hours until resolved. `WORKFLOW_PAGING_ENABLED` / `WORKFLOW_PAGING_PREVIEW`. Azure Monitor action group as backup if pager path fails.

## Acceptance criteria

- [x] Dashboard shows expected vs collected rent for current and next month with progress bars
- [x] Staff can record manual/back payments for active leases via `/office/payments`
- [x] Active leases get a SQL charge 10 days before the 1st (with 3-day lookback); balance includes prior open charges
- [x] Tenants can pay in full or in part (minimum $100) from the portal; amount is fixed before Stripe Checkout
- [x] Portal and emails state that only payment in full within the grace period avoids the late fee
- [x] Tenant auto-comms follow schedule; gated by `RENT_COMMUNICATIONS_*` **and** per-renter consent (default off); preview before live
- [x] At most one tenant email per lease per day; no automatic email backlog after outage; staff catch-up/create email only when `notify` is explicitly on
- [x] Staff can send one-off balance notices without auto-comms consent
- [x] Late fee auto-applies after grace on scheduler invoices; catch-up invoices are late-fee exempt; red only after fee applied (or prior-month arrears)
- [x] Staff can dry-run and run invoice catch-up from `/office/invoices`
- [x] Prod alerts when `rentDailyJobs` is silent for 48 hours
- [ ] 90-day renewal workflow; rent schedule drives invoice amounts
- [ ] Service request close requires cost; maintenance totals by property
- [ ] Weekly digest to property managers when `OFFICE_DIGEST_ENABLED=true`
- [ ] Workflow failures visible on `/office/operations`; SMS paging with 24h cap per incident
- [x] Guided office UI (no raw lease IDs); SWA-safe shells + API mutations
- [x] Deep links retain query string through staff login (`returnUrl` → `post_login_redirect_uri`)
- [x] `units.available` in SQL gates apply

## Out of scope

- Second ledger or manual Stripe edits for routine rent
- Third-party eSign (see lease-esign plan)
- Tenant SMS (ACS email only unless reviewed path added)
- Ranking or auto-approval from waitlist

## Revision notes

- 2026-11-07: OP-29 — per-renter `auto_communications_enabled` (default off) with consent notice; daily auto scheduler skips without consent; catch-up/create `notify` default off; unit **Email balance notice** one-off; agent rule `renter-communications.mdc`.
- 2026-11-03: Invoice resilience — 3-day scheduler lookback (late fees still apply); staff catch-up API/UI with apologetic email and no auto late fee; prod 48h missed-run alert; runbook `rent-invoice-catch-up.md` (OP-25–28).
- 2026-11-03: Unit health — yellow (grace) only when the *current* month is the sole unpaid period; prior-month arrears (open or missing invoices) are always red, including on the 2nd–4th.
- 2026-09-27: Dropped Stripe Invoicing. Azure SQL is the single source of truth for charges, payments, and balances; Stripe only processes payments. Added portal partial payments (OP-24) with a $100 minimum, fixed-amount Checkout, and clear late-fee policy. Daily job order is now late fees → charges → communications.
- 2026-09-27: Timer hosting — replaced three `app.timer` schedulers in the SWA API (which never fire on managed Functions) with one `rentDailyJobs` timer on a standalone Flex Consumption Function App (OP-23). Prod runs daily at 13:00 UTC; staging disabled and run on demand. Budget raised to $70 for the SQL wake window.
- 2026-08-31: Phase 2 — automated rent billing timers (`rentInvoiceScheduler`, `rentLateFeeScheduler`), tenant comms (`rentCommunicationScheduler`, `tenant_communication_state`, `communication_log`), `GET /api/office/communications/preview`, `RENT_COMMUNICATIONS_*` flags, Stripe invoice due-on-1st with prior-balance line items and no auto-email.
- 2026-08-30: Unit manage detail — `GET /api/office/units/{id}` enriched payload; `/office/unit` shows balance, lease progress, payments, and service requests.
- 2026-08-30: Manual payments — `POST /api/office/payments`, `/office/payments` UI, dashboard rent roll with progress bars.
- 2026-08-30: Manual data entry — `/office/renters` create/edit (`POST/PATCH /api/office/people`); `/office/leases` existing-renter picker, edit, and end-lease (`status` on lease API).
- 2026-08-30: Phase 1 — unit health + dashboard API/UI, deep-link login, SQL `units.available`, `people.stripe_customer_id`, apply reads SQL.
- 2026-08-30: Initial plan — dashboard R/Y/G, automated billing/comms with preview and daily send gate, renewal + rent schedule, maintenance costs, weekly digest, workflow SMS paging, SWA static routing and deep-link auth, staff data management model.
