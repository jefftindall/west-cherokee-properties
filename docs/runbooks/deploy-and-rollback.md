# Runbook: Deploy and rollback

CD (`CD: main`) builds **once**, deploys that artifact to staging, runs smoke + journeys, then deploys the **same** artifact to production.

## Happy path

1. Merge to `main`.
2. Build release artifact (`dist` + `api`).
3. Staging: apply noindex patch, SWA deploy, smoke, journeys.
4. Production: SWA deploy, smoke (canary; does not auto-rollback).

## Rollback

Redeploy the previous GitHub Actions artifact or revert the `main` commit and re-run `CD: main`. There is no automatic prod rollback.

Terraform apply is not part of CD until OIDC identities exist. Apply staging/prod locally or from the CI plan job after bootstrap.
