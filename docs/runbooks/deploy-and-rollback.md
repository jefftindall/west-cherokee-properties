# Runbook: Deploy and rollback

**Last updated:** 2026-08-29

CD (`CD: main`, `.github/workflows/cd-main.yml`) builds **once**, deploys that artifact to staging, runs smoke + journeys, then deploys the **same** artifact to production.

Repo: `jefftindall/west-cherokee-properties`. Staging host: `test.westcherokee.com`. Prod host: `westcherokee.com`.

## Happy path

1. Merge to `main` (Protect main + required checks).
2. Build release artifact (`dist` + `api`).
3. Staging: apply noindex patch, SWA deploy, smoke, journeys.
4. Production: SWA deploy, smoke (canary; does not auto-rollback).

```bash
gh workflow list --repo jefftindall/west-cherokee-properties
gh workflow run "CD: main" --repo jefftindall/west-cherokee-properties
gh run list --repo jefftindall/west-cherokee-properties --workflow=cd-main.yml --limit 5
gh run watch --repo jefftindall/west-cherokee-properties
```

Job-level `if:` cannot see GitHub Environment variables. CD deploys staging when the **repo** var `STAGING_HOSTNAME` is set (written by the staging Terraform stack from the SWA default host). Prod stays skipped until `PROD_HOSTNAME` is set the same way. `AZURE_CLIENT_ID` lives on the `staging` / `prod` environments and is only used inside those jobs after they start.

## Local Terraform (not in CD until OIDC env identities exist)

```bash
az account set --subscription 5f82b068-cbaa-40bf-9d56-e9932a64a41c

cd infra/environments/staging
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan

cd ../prod
terraform init -input=false
terraform plan -input=false -out=tfplan
terraform apply tfplan
```

State: `rg-wcp-tfstate` / `stwcpstateeu2` / `tfstate` keys `west-cherokee-properties/staging.tfstate` and `west-cherokee-properties/prod.tfstate`.

## Rollback

There is no automatic prod rollback.

```bash
# Re-run a known-good CD run (same commit / artifact)
gh run list --repo jefftindall/west-cherokee-properties --workflow=cd-main.yml --limit 10
gh run rerun RUN_ID --repo jefftindall/west-cherokee-properties

# Or revert main and let CD: main run again
git revert COMMIT_SHA
git push origin HEAD
```

Redeploying an older Actions artifact from the run UI is equivalent to `gh run rerun` on that successful run.
