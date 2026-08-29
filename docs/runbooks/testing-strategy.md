# Runbook: Testing strategy

**Last updated:** 2026-08-29

| Layer | When | Command |
|-------|------|---------|
| Static analysis | Every PR + `main` | `npm run lint` |
| Unit tests | Every PR | `npm run test:api-auth && npm run test:api-store && npm run test:api-stripe && npm run test:api-contact && npm run test:staging-noindex` |
| Terraform plan | PRs touching `infra/` when `AZURE_TF_CLIENT_ID` exists | CI jobs `Plan staging` / `Plan prod` |
| Smoke | After staging (and prod) deploy | `npm run test:smoke` |
| Journeys | After staging smoke | `npm run test:journey` |

Smoke covers public routes, robots/sitemap, and anonymous `/office` + `/portal` redirects on SWA hosts.

Journeys cover the visitor path: home → properties → a leased home (maps / Zillow links, no apply CTA) → contact.

`BASE_URL` is required for Playwright.

```bash
npm run lint
npm run test:api-auth
npm run test:api-store
npm run test:api-stripe
npm run test:api-contact
npm run test:staging-noindex

# Local preview (after npm run build && npx astro preview --host 127.0.0.1 --port 4321)
BASE_URL=http://127.0.0.1:4321 npm run test:smoke
BASE_URL=http://127.0.0.1:4321 npm run test:journey

# Deployed hosts
BASE_URL=https://test.westcherokee.com npm run test:smoke
BASE_URL=https://test.westcherokee.com npm run test:journey
BASE_URL=https://westcherokee.com npm run test:smoke
```

On PowerShell:

```powershell
$env:BASE_URL = "http://127.0.0.1:4321"; npm run test:smoke
$env:BASE_URL = "https://test.westcherokee.com"; npm run test:smoke
```

CI workflow: `.github/workflows/ci-static-analysis.yml`. CD smoke: `.github/workflows/cd-main.yml` with `BASE_URL=https://$STAGING_HOSTNAME` / `https://$PROD_HOSTNAME`.
