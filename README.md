# West Cherokee Properties

Rental property management site for [westcherokee.com](https://westcherokee.com): public marketing, rental applications, and authenticated office (staff) plus resident portal. Azure Static Web Apps, Terraform, Key Vault, Azure SQL, and Stripe invoices.

## Features

- Public site: Home, Properties, About, Contact, Apply
- Staff `/office` (Entra workforce) — applications, renters, leases, invoices, service requests, access
- Resident `/portal` (Entra External ID — separate directory) — lease, invoices, pay rent, receipts, service requests
- Stripe Invoices for rent; Checkout for optional application fees
- Terraform for Azure (bootstrap + staging/prod, Key Vault, OIDC)

## Quick start (local)

```bash
npm install
npm run dev
```

### Lint / static analysis

```bash
npm run lint
```

Runs Terraform fmt + TFLint + validate, `astro check`, and API syntax checks. The same gates run on every PR via [`.github/workflows/ci-static-analysis.yml`](.github/workflows/ci-static-analysis.yml). Agents must run this before committing (see [AGENTS.md](AGENTS.md)). Deploys go through a PR and Actions (`CD: main`, `CD: terraform`), not a local `terraform apply`.

API functions (optional local):

```bash
cd api
cp local.settings.json.example local.settings.json
# fill secrets
npm install
# requires Azure Functions Core Tools
func start
```

## Documentation

- [Authentication and authorization](docs/architecture/authentication-authorization.md)
- [Data persistence](docs/architecture/data-persistence.md)
- [Initial setup](docs/setup.md)
- [Brand & UI style guide](docs/style-guide.md) — visual: `/style-guide`
- Runbooks: [GitHub Actions naming](docs/runbooks/github-actions-naming.md), [rotate secrets](docs/runbooks/rotate-secrets.md), [deploy and rollback](docs/runbooks/deploy-and-rollback.md), [DNS and domain](docs/runbooks/dns-and-domain.md), [cost and quotas](docs/runbooks/cost-and-quotas.md), [testing strategy](docs/runbooks/testing-strategy.md)

## Security model

Authentication and authorization are separate. Staff sign in with workforce Entra; renters sign in with Entra External ID (not guests in the office tenant).

1. SWA routes protect `/office`, `/portal`, and `/api/*`. Public exceptions: contact, apply, Stripe webhook.
2. API never treats a signed-in principal as permission to act. Office re-checks the permission catalog. Portal scopes rows to the signed-in email.
3. GitHub Actions uses OIDC to Azure (separate identities for SWA deploy vs Terraform).

## Infrastructure

| Path | Purpose |
|------|---------|
| `infra/bootstrap` | Remote state storage + Terraform OIDC identity + shared KV / GitHub App placeholders (local Terraform state, East US 2) |
| `infra/environments/staging` | Staging stack |
| `infra/environments/prod` | Production stack |
| `infra/modules/site` | Shared SWA + Key Vault + SQL + Stripe webhook module |
