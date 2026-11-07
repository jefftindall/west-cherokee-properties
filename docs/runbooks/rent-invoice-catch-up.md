# Runbook: Rent invoice catch-up

**Last updated:** 2026-11-07

Use this when billing months are missing from Azure SQL (balance due is `$0` while the unit page shows elapsed unpaid time), or after the missed-run monitor fires and a scheduling day fell outside the daily job’s 3-day lookback.

## Two paths

| Situation | What to do | Late fee |
|-----------|------------|----------|
| Daily job missed ≤3 Eastern days around the lead day (10 days before the 1st) | Re-run `rentDailyJobs` (or wait for the next scheduled run). The invoice step looks back 3 days. | Applies after grace as usual |
| Job down longer, staging never ran, or months were never posted | Staff **catch-up** on `/office/invoices` | **Never** auto-applied on catch-up invoices |

Catch-up posts base rent (plus pet rent) only and tags invoices `billing_source = catchup`. Email is **optional** (default off): when notify is checked, one apologetic email per lease lists the months posted. That one-off does **not** require per-renter automatic-communications consent.

## Office UI (preferred)

1. Sign in to `/office` (staging or prod).
2. Open **Invoices**.
3. Under **Catch up missing months**, optionally paste a lease id (leave blank for all active leases).
4. Click **Dry-run**. Confirm `wouldCreateCount` and the period list in the JSON panel.
5. Leave **Email balance statement after create** unchecked unless you intend to notify (default off).
6. Click **Create**.
7. Refresh the unit manage page: balance due and open invoices should match the missing months; health should be red when prior months are open.

To email a balance notice later without creating invoices, use **Email balance notice** on `/office/unit?unitId=…`.

## API

```http
POST /api/office/invoices/catch-up
Content-Type: application/json

{ "dryRun": true, "leaseId": "lease-…", "notify": false }
```

Omit `leaseId` to process every active lease. Set `"dryRun": false` to create invoices. Set `"notify": true` to email after create (preview still delivers to `CONTACT_NOTIFY_EMAIL` when `RENT_COMMUNICATIONS_PREVIEW=true`). `notify` defaults to false.

Requires `invoices.write`.

## After a missed-run alert

1. Check Application Insights (`appi-wcp-<env>`) for traces containing `"job":"rentDailyJobs"`.
2. Re-run the timer ([rent-jobs.md](./rent-jobs.md) — portal Test/Run or master-key admin POST).
3. If the lead day for next month’s charge is already more than 3 days ago, run catch-up for affected leases so charges exist; catch-up waives automatic late fees for those rows.
4. Resolve or acknowledge the Azure Monitor alert once a successful run (or catch-up) is confirmed.

## Staging note

Staging keeps `rentDailyJobs` disabled and runs on demand only. Missing months after seeding or long gaps are expected until someone runs the job on a lookback day **or** uses catch-up. Prefer catch-up when several past months are missing.

## Verify

- `/office/unit?unitId=…` — balance due > 0 when months are unpaid; open invoice list present
- `/office/invoices` — new rows show `catchup` (or `scheduler` after a resilient daily run)
- When notify was on: communications log / ACS (or preview inbox) — one `invoice_catchup_notice` per lease that day
