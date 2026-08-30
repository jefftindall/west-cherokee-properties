# Office operations portal

**Audience:** Agents, implementers  
**Last updated:** 2026-08-30  
**Status:** in_progress (phase 1 complete)  
**Depends on:** phases 7–9 (leases, Stripe invoices, service requests), ACS email, [`lease-esign.md`](./lease-esign.md) for executed renewals, [`data-persistence.md`](../architecture/data-persistence.md)

Extend `/office` from thin CRUD into an operational portal: property dashboard with unit health (green / yellow / red), automated rent billing and tenant communications, lease renewal workflow starting 90 days before expiration, structured rent increases, service-request cost tracking, weekly staff digest emails, and workflow monitoring with SMS paging. Stripe remains the money system of record.

## Unit health (R/Y/G)

Rent due **1st of month**, **3-day grace**, **$50 late fee** ([`leaseTerms.js`](../../api/src/lib/leaseTerms.js), [`docs/legal/README.md`](../legal/README.md)).

| Status | Rule |
|--------|------|
| **Green** | Active lease + current-month charges fully paid |
| **Yellow** | Active lease + unpaid + within grace (2nd–4th) |
| **Red** | Active lease + unpaid + after grace + late fee applied |
| **Vacant** | No active lease (neutral, not R/Y/G) |

Health is **computed** from invoice/payment state (America/New_York), not stored as a separate score.

## Staff data management

Operational data is entered in the office UI; automations read Azure SQL. Staff never edit Stripe for routine rent amounts.

| Concern | Store | Staff enters via |
|---------|-------|------------------|
| Marketing copy | Git | PR |
| Unit availability | SQL `units.available` (new) | Office unit toggle at turnover |
| Applications / leases / rent schedule | SQL | `/office/applications`, `/office/leases`, lease manage shell |
| Invoices / payments | Stripe + SQL mirror | **Automated** once lease is active |
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
| OP-05 | planned | 2 | Timer `rentInvoiceScheduler` — invoice 10 days before due; idempotent; reuse Stripe customer |
| OP-06 | planned | 2 | Timer `rentLateFeeScheduler` — $50 fee after grace; Stripe due date = 1st |
| OP-07 | planned | 2 | Timer `rentCommunicationScheduler` — sole tenant email path; daily send gate |
| OP-08 | planned | 2 | `tenant_communication_state`, `communication_log`; state-driven messages (no catch-up queue) |
| OP-09 | planned | 2 | Comms preview API + flags `RENT_COMMUNICATIONS_*`; disable Stripe customer invoice emails |
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

Suggested PR sequence: OP-01–04 → OP-05–09 → OP-10–12 → OP-13–14 → OP-15–16 → OP-17–20 (+ Playwright for dashboard, digest preview, deep-link login).

## Billing and tenant communications

| When | Action |
|------|--------|
| 10 days before due | Create Stripe invoice (schedule rent + pets + open balance); no tenant email from invoice job |
| Due (1st) | Comm scheduler: `due_reminder` if unpaid |
| 2nd–4th | Comm scheduler: `grace_warning` (max one email/day) |
| After grace, still unpaid | Late-fee job adds $50; comm scheduler: `balance_overdue` |
| Weekly after late fee | `balance_overdue` if ≥7 days since last and gate allows |

**One email per lease per calendar day:** state-driven selection (priority: balance_overdue → grace_warning → due_reminder → invoice_notice). No queue replay after outage. Transactional gate before ACS send; unique constraint on `(lease_id, sent_date)`.

**Feature flags:** `RENT_PAYMENTS_ENABLED` (existing), `RENT_COMMUNICATIONS_ENABLED`, `RENT_COMMUNICATIONS_PREVIEW` (staff inbox until reviewed).

## Workflow monitoring

Every timer wrapped in `runMonitoredJob`. Failure or missed run opens `workflow_incidents`. Site admin SMS via `ALERT-PHONE` immediately, then at most once per 24 hours until resolved. `WORKFLOW_PAGING_ENABLED` / `WORKFLOW_PAGING_PREVIEW`. Azure Monitor action group as backup if pager path fails.

## Acceptance criteria

- [x] Dashboard shows 3 properties, 5 units, correct R/Y/G/vacant from live invoice data
- [ ] Active leases get Stripe invoices 10 days before the 1st, including prior open balances
- [ ] Tenant comms follow schedule; gated by `RENT_COMMUNICATIONS_*`; preview before live
- [ ] At most one tenant email per lease per day; no catch-up backlog after outage
- [ ] Late fee auto-applies after grace; red only after fee applied
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

- 2026-08-30: Phase 1 — unit health + dashboard API/UI, deep-link login, SQL `units.available`, `people.stripe_customer_id`, apply reads SQL.
- 2026-08-30: Initial plan — dashboard R/Y/G, automated billing/comms with preview and daily send gate, renewal + rent schedule, maintenance costs, weekly digest, workflow SMS paging, SWA static routing and deep-link auth, staff data management model.
