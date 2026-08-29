# Runbook: Testing strategy

| Layer | When | Command |
|-------|------|---------|
| Static analysis | Every PR + `main` | `npm run lint` |
| Unit tests | Every PR | `npm run test:api-*` |
| Terraform plan | PRs touching `infra/` when OIDC vars exist | CI Plan staging/prod |
| Smoke | After staging (and prod) deploy | `npm run test:smoke` |
| Journeys | After staging smoke | `npm run test:journey` |

Smoke covers public routes, robots/sitemap, and anonymous `/office` + `/portal` redirects on SWA hosts.

Journeys cover the visitor path: home → properties → apply, and contact.

`BASE_URL` is required for Playwright.
