# Runbook: Rotate secrets

If a secret is leaked in logs, a PR, or chat, rotate it **before** re-running the job.

| Secret | Where | How |
|--------|-------|-----|
| Stripe test/live keys | `kv-wcp-shared` | Stripe Dashboard → roll key → set vault value |
| Stripe webhook signing secret | env Key Vault `STRIPE-WEBHOOK-SECRET` | Recreate webhook endpoint or roll secret, then copy into SWA `STRIPE_WEBHOOK_SECRET` |
| Turnstile secret | `kv-wcp-shared` | Cloudflare dashboard |
| ACS connection string | `kv-wcp-shared` | Azure Communication Services |
| SQL admin password | env Key Vault | Rotate SQL login, update `SQL-CONNECTION-STRING` and SWA app settings |
| Entra SWA client secret | env Key Vault `AAD-CLIENT-SECRET` | Terraform recreate `azuread_application_password` |
| External ID client secret | `kv-wcp-shared` | External ID app registration |

Never print values. Log secret **names** only.
