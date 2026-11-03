# Runbook: Deploy and rollback

**Last updated:** 2026-11-03

Changes ship through a pull request. Agents must not apply Terraform or deploy from a laptop unless a human explicitly asks.

CD (`CD: main`, `.github/workflows/cd-main.yml`) builds **once**, deploys that artifact to staging, runs smoke + journeys, then deploys the **same** artifact to production. When `infra/` changed, the same workflow applies staging Terraform before staging deploy, and prod Terraform only after staging verify succeeds. App-only merges skip Terraform.

Repo: `jefftindall/west-cherokee-properties`. Staging host: `test.westcherokee.com`. Prod host: `westcherokee.com`.

## Happy path

1. Merge to `main` (Protect main + required checks).
2. `CD: main` detects app vs infra path changes (docs-only merges skip release jobs).
3. If `infra/` changed: apply staging Terraform (parallel with the release build).
4. Build the release artifact (`dist` + `api`) and the rent jobs package (`rent-jobs`).
5. Staging: apply noindex patch, SWA deploy, rent jobs Function App deploy, smoke, journeys.
6. If `infra/` changed: apply prod Terraform (only after staging verify).
7. Production: SWA deploy, rent jobs Function App deploy, smoke (canary; does not auto-rollback).

The rent jobs deploy steps skip until Terraform has written `AZURE_RENT_JOBS_FUNCTION_APP_NAME` to the environment. See [rent-jobs.md](./rent-jobs.md).

```bash
gh workflow list --repo jefftindall/west-cherokee-properties
gh workflow run "CD: main" --repo jefftindall/west-cherokee-properties
gh run list --repo jefftindall/west-cherokee-properties --workflow=cd-main.yml --limit 5
gh run watch --repo jefftindall/west-cherokee-properties
```

Job-level `if:` cannot see GitHub Environment variables. CD deploys staging when the **repo** var `STAGING_HOSTNAME` is set (written by the staging Terraform stack from the SWA default host). Prod stays skipped until `PROD_HOSTNAME` is set the same way. `AZURE_CLIENT_ID` lives on the `staging` / `prod` environments and is only used inside those jobs after they start.

## Terraform (staging / prod)

PRs that touch `infra/` run **Plan staging** and **Plan prod**. Merge to `main` runs Terraform apply inside `CD: main` (OIDC + GitHub App token, same as the plan jobs): staging apply before staging deploy; prod apply after staging smoke/journeys.

Do not `terraform apply` locally for these stacks unless a human explicitly asks. Bootstrap (`infra/bootstrap`) is local state and stays a one-time human apply — [setup.md](../setup.md).

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
