# Runbook: Rent jobs Function App

**Last updated:** 2026-09-27

Daily rent automation (late fees, then next-month charges, then tenant emails) runs in a standalone Flex Consumption Function App per environment: `func-wcp-jobs-staging`, `func-wcp-jobs-prod`. It is separate from the site's SWA managed Functions, which only support HTTP triggers.

| Environment | Schedule | How it runs |
|-------------|----------|-------------|
| prod | Daily 13:00 UTC (8–9 AM New York) | Timer `rentDailyJobs` |
| staging | Off (`AzureWebJobs.rentDailyJobs.Disabled=true`) | On demand only |

One run executes three steps in order inside a single Azure SQL wake window: invoice creation (10 days before the 1st), late fees (after grace), then tenant communications. A failing step does not skip the later ones; the invocation is marked failed and the per-step summary is logged to Application Insights.

What each step actually does is still gated by app settings from Terraform: `RENT_PAYMENTS_ENABLED` (portal online payment; charges are always created in SQL), `RENT_COMMUNICATIONS_ENABLED` / `RENT_COMMUNICATIONS_PREVIEW` (tenant email; preview delivers to `CONTACT_NOTIFY_EMAIL`). The job refuses to run if `SQL_CONNECTION_STRING` is missing.

## Deploy

Terraform (`infra/modules/site/rent_jobs.tf`) creates the app, plan, and storage account and writes the `AZURE_RENT_JOBS_FUNCTION_APP_NAME` environment variable. `CD: main` builds the package once (`npm run package:rent-jobs`: `api/src/jobs` + `api/src/lib`, no HTTP handlers) and deploys it after each SWA deploy. The deploy steps skip until that variable exists, so the first merge needs `CD: terraform` to finish and then one more `CD: main` run.

## Run on demand (staging, or a prod re-run)

The runs are idempotent: invoices are keyed per lease and period, late fees apply once per invoice, and `communication_log` allows one email per lease per New York day.

**Portal (preferred):** Function App `func-wcp-jobs-staging` → Functions → `rentDailyJobs` → Code + Test → Test/Run → Run. Disabled timers still run from Test/Run because the portal uses the master key.

**CLI:** the master key is a secret. Keep it in a variable and never echo it.

```bash
RG=rg-wcp-staging
APP=func-wcp-jobs-staging
HOST=$(az functionapp show -g "$RG" -n "$APP" --query defaultHostName -o tsv)
KEY=$(az functionapp keys list -g "$RG" -n "$APP" --query masterKey -o tsv)
curl -sS -o /dev/null -w "%{http_code}\n" -X POST "https://$HOST/admin/functions/rentDailyJobs" \
  -H "x-functions-key: $KEY" -H "Content-Type: application/json" -d '{"input":""}'
unset KEY
```

`202` means the run was accepted. Results appear in Application Insights `appi-wcp-staging` (traces with `"job":"rentDailyJobs"`).

## Turn the schedule on or off

Change `rent_jobs_schedule_enabled` in `infra/environments/<env>/main.tf` and merge; `CD: terraform` applies it. The portal Enable/Disable button works for an emergency stop, but the next Terraform apply resets it.

## Cost

Compute stays inside the Flex Consumption monthly free grant. The real cost is Azure SQL serverless staying awake for one auto-pause window (~1 hour) per run; see [cost-and-quotas.md](./cost-and-quotas.md). That is why staging runs only on demand.
