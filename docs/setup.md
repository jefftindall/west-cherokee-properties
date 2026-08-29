# Initial setup

Provision Azure with Terraform (bootstrap + staging/prod), connect GitHub, store secrets in Key Vault, and cut DNS over when the domain is ready.

## Prerequisites

- Azure subscription `5f82b068-cbaa-40bf-9d56-e9932a64a41c` (default `subscription_id` in stacks) + Owner or Contributor
- Azure CLI (`az login`)
- Terraform >= 1.5
- Resource providers: `Microsoft.Resources`, `Microsoft.Storage`, `Microsoft.KeyVault`, `Microsoft.Web`, `Microsoft.Authorization`, `Microsoft.Sql`
- GitHub repo [jefftindall/west-cherokee-properties](https://github.com/jefftindall/west-cherokee-properties) (`github_repo_id` `1350171621`; OIDC subjects use owner@id/repo@id)
- Permission to create Entra **workforce** app registrations
- A separate **Entra External ID** (CIAM) tenant for renters — never invite renters as B2B guests in the office tenant
- Stripe account (test keys first)
- Cloudflare Turnstile site + secret
- `gh` CLI if Terraform should write Actions variables

## Layout

| Path | Purpose |
|------|---------|
| `infra/bootstrap` | Remote state + shared KV + Terraform OIDC (local state, East US 2) |
| `infra/environments/staging` | Staging SWA + env KV (`create_sql` is false until Azure SQL quota is available) |
| `infra/environments/prod` | Production stack |
| `infra/modules/site` | Shared module |

Names use the `wcp` prefix so they never collide with other projects on the same subscription.

## 1. Bootstrap (once, local state)

```bash
export GH_TOKEN="$(gh auth token)"
cd infra/bootstrap
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

Replace `REPLACE_ME` secrets in `kv-wcp-shared` with the `az keyvault secret set` commands in [rotate-secrets.md](runbooks/rotate-secrets.md) (public contact and Turnstile site key are filled in there; never print other values).

## 2. Apply staging, then prod

```bash
cd infra/environments/staging
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

Copy `AAD-CLIENT-ID` / `AAD-CLIENT-SECRET` and `STRIPE-WEBHOOK-SECRET` from the env Key Vault into SWA app settings (`AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`, `STRIPE_WEBHOOK_SECRET`) so Easy Auth and webhooks work. Create the Stripe webhook endpoint in the Dashboard (test for staging, live for prod) pointing at `https://<swa-host>/api/stripeWebhook` with events `invoice.paid`, `invoice.payment_failed`, `invoice.finalized`, `checkout.session.completed`, and `charge.refunded`. Staging has `RENT_PAYMENTS_ENABLED=true`; prod stays false until go-live.

## 3. External ID

Create a customer tenant. Register an app with redirect URIs `https://<swa>/.auth/login/externalid/callback`. Enable email + Google/Apple/Microsoft and self-service password reset. Put the client id/secret in `kv-wcp-shared`. Update `public/staticwebapp.config.json` well-known URL to the CIAM issuer when the tenant exists.

## 4. Domain

Point `test.westcherokee.com` at staging and `westcherokee.com` at prod. See [dns-and-domain.md](runbooks/dns-and-domain.md).
