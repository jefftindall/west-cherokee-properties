# Runbook: Rotate secrets

**Last updated:** 2026-08-30

If a secret is leaked in logs, a PR, or chat, rotate it **before** re-running the job. Never print values (`az keyvault secret show --query value`, `echo`, `set -x`, or `az ... -o json` on a secret). Log **names** only.

## Constants

| Item | Value |
|------|--------|
| Subscription | `5f82b068-cbaa-40bf-9d56-e9932a64a41c` |
| Shared vault | `kv-wcp-shared` (`rg-wcp-shared`) |
| Staging vault / SWA / SQL | `kv-wcp-staging` / `swa-wcp-staging` / `sql-wcp-staging` (`rg-wcp-staging`) |
| Prod vault / SWA / SQL | `kv-wcp-prod` / `swa-wcp-prod` / `sql-wcp-prod` (`rg-wcp-prod`) |
| SQL admin / database | `wcpadmin` / `wcp` |
| GitHub repo | `jefftindall/west-cherokee-properties` |

```bash
az account set --subscription 5f82b068-cbaa-40bf-9d56-e9932a64a41c
```

## Safe set / verify (no values on stdout)

Write the new value into a 0600 file (do not `cat` it). `--file` reads the file; `--output none` keeps the value out of the terminal.

```bash
# PowerShell: New-Item $env:TEMP\wcp-secret.txt -ItemType File; then paste the value in an editor
umask 077
# paste the value into /tmp/wcp-secret.txt with an editor, then:
az keyvault secret set \
  --vault-name kv-wcp-shared \
  --name TURNSTILE-SECRET-KEY \
  --file /tmp/wcp-secret.txt \
  --output none \
  --only-show-errors
rm -f /tmp/wcp-secret.txt

az keyvault secret show \
  --vault-name kv-wcp-shared \
  --name TURNSTILE-SECRET-KEY \
  --query "{name:name,updated:attributes.updated}" \
  -o json
```

List names only:

```bash
az keyvault secret list --vault-name kv-wcp-shared --query "[].name" -o tsv
az keyvault secret list --vault-name kv-wcp-staging --query "[].name" -o tsv
az keyvault secret list --vault-name kv-wcp-prod --query "[].name" -o tsv
```

Public contact and the Turnstile **site** key (widget key, not the secret) may sit on the command line:

```bash
az keyvault secret set --vault-name kv-wcp-shared --name SITE-CONTACT-EMAIL --value "info@westcherokee.com" --output none --only-show-errors
az keyvault secret set --vault-name kv-wcp-shared --name SITE-CONTACT-PHONE --value "678-885-7368" --output none --only-show-errors
az keyvault secret set --vault-name kv-wcp-shared --name TURNSTILE-SITE-KEY --value "0x4AAAAAAEg3FqGts0TKF-6R" --output none --only-show-errors
```

Terraform `lifecycle.ignore_changes = [value]` on these secrets: vault updates stay; a later `terraform apply` will not overwrite them.

## Shared vault (`kv-wcp-shared`)

| Secret | Source | Set |
|--------|--------|-----|
| `SITE-CONTACT-EMAIL` | Public inbox | command above (`info@westcherokee.com`) |
| `SITE-CONTACT-PHONE` | Public phone | command above (`678-885-7368`) |
| `TURNSTILE-SITE-KEY` | Cloudflare Turnstile → Site key | command above |
| `TURNSTILE-SECRET-KEY` | Cloudflare Turnstile → Secret key | `--file` into `kv-wcp-shared` |
| `ALERT-EMAIL` | Budget / monitor inbox | `--file` into `kv-wcp-shared` |
| `ACS-CONNECTION-STRING` | Azure Communication Services | `--file` into `kv-wcp-shared` |
| `ACS-EMAIL-SENDER` | ACS MailFrom address | `--file` into `kv-wcp-shared` |
| `ALLOWED-USER-IDS` | Workforce Entra object IDs (comma-separated) | `--file` into `kv-wcp-shared` |
| `EXTERNAL-ID-CLIENT-ID` | External ID app registration | `--file` into `kv-wcp-shared` |
| `EXTERNAL-ID-CLIENT-SECRET` | External ID app → new client secret | `--file` into `kv-wcp-shared` |
| `STRIPE-TEST-SECRET-KEY` | Stripe Dashboard (test) → roll restricted key | `--file` into `kv-wcp-shared` |
| `STRIPE-LIVE-SECRET-KEY` | Stripe Dashboard (live) → roll restricted key | `--file` into `kv-wcp-shared` |
| `GITHUB-APP-ID` | GitHub App `wcp-terraform` → App ID | `node scripts/register-wcp-github-app.mjs` (or `--file` if importing) |
| `GITHUB-APP-INSTALLATION-ID` | App install on this repo | same register script |
| `GITHUB-APP-PRIVATE-KEY` | App → Generate a private key | `--file` into `kv-wcp-shared` (never print the PEM) |

### GitHub App (`wcp-terraform`)

CI mints a short-lived installation token from `GITHUB-APP-PRIVATE-KEY`. Generating a new key does **not** need an env-stack apply (plan downloads the PEM at job time).

1. GitHub → Settings → Developer settings → GitHub Apps → `wcp-terraform` → Generate a private key.
2. Write the downloaded PEM into a 0600 file (do not `cat` it) and `--file` into `GITHUB-APP-PRIVATE-KEY` on `kv-wcp-shared`.
3. Revoke the old key in the GitHub UI. App id and installation id stay the same.

To recreate the whole app, re-run `node scripts/register-wcp-github-app.mjs` after bootstrap placeholders exist.

After `TURNSTILE-SECRET-KEY`, `ACS-*`, `ALLOWED-USER-IDS`, External ID, or Stripe keys change, re-apply the env stacks so SWA `app_settings` pick them up (those values are interpolated at apply time):

```bash
cd infra/environments/staging
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan

cd ../prod
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

## Env vaults (`kv-wcp-staging`, `kv-wcp-prod`)

| Secret | Staging vault | Prod vault | How |
|--------|---------------|------------|-----|
| `STRIPE-WEBHOOK-SECRET` | `kv-wcp-staging` | `kv-wcp-prod` | Stripe Dashboard → webhook signing secret (test vs live) → `--file` |
| `AAD-CLIENT-ID` | terraform | terraform | Recreate only via Terraform |
| `AAD-CLIENT-SECRET` | terraform | terraform | Recreate the app password (below) |
| `SQL-ADMIN-PASSWORD` | terraform | terraform | Rotate SQL login, then rewrite connection string |
| `SQL-CONNECTION-STRING` | terraform | terraform | Must match `wcpadmin` password on `sql-wcp-<env>.database.windows.net` |

`AAD_CLIENT_ID` / `AAD_CLIENT_SECRET` are set by env Terraform from the Entra app (also stored as `AAD-CLIENT-ID` / `AAD-CLIENT-SECRET` in the env vault). Do not set them by hand — the next apply would overwrite. Copy only the webhook signing secret onto the Static Web App **without** printing. Do not `set -x`.

```bash
# Staging — repeat for prod: swa-wcp-prod, rg-wcp-prod, kv-wcp-prod
az staticwebapp appsettings set \
  --name swa-wcp-staging \
  --resource-group rg-wcp-staging \
  --output none \
  --setting-names \
    STRIPE_WEBHOOK_SECRET="$(az keyvault secret show --vault-name kv-wcp-staging --name STRIPE-WEBHOOK-SECRET --query value -o tsv)"
```

### Entra SWA client secret

```bash
cd infra/environments/staging
terraform apply -input=false -replace='module.site.azuread_application_password.swa'

cd ../prod
terraform apply -input=false -replace='module.site.azuread_application_password.swa'
```

Re-apply the env stack after replace so SWA `AAD_CLIENT_SECRET` picks up the new password.

### SQL admin password

```bash
# 1. Put the new password in /tmp/wcp-secret.txt (0600). Do not print it.
az sql server update \
  --name sql-wcp-staging \
  --resource-group rg-wcp-staging \
  --admin-user wcpadmin \
  --admin-password "$(cat /tmp/wcp-secret.txt)" \
  --output none \
  --only-show-errors

# 2. Store password + rebuild the connection string (do not echo).
az keyvault secret set --vault-name kv-wcp-staging --name SQL-ADMIN-PASSWORD --file /tmp/wcp-secret.txt --output none --only-show-errors

# Connection string shape (password from the file; do not print the finished string):
# Server=tcp:sql-wcp-staging.database.windows.net,1433;Initial Catalog=wcp;Persist Security Info=False;User ID=wcpadmin;Password=<from file>;MultipleActiveResultSets=False;Encrypt=True;TrustServerCertificate=False;Connection Timeout=30;

rm -f /tmp/wcp-secret.txt

# 3. Re-apply staging (writes SQL-CONNECTION-STRING + SWA SQL_CONNECTION_STRING) or set SWA SQL_CONNECTION_STRING the same no-print way as above.
cd infra/environments/staging
terraform apply -input=false
```

Repeat with `sql-wcp-prod`, `rg-wcp-prod`, `kv-wcp-prod`, `sql-wcp-prod.database.windows.net`, and `infra/environments/prod`.

## After a leak

1. Rotate the named secret using this runbook.
2. Confirm the old value no longer works (Dashboard revoke / Azure regenerate).
3. Re-run the failed GitHub Actions job only after the vault (and SWA settings, if applicable) are updated.
