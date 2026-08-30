# Runbook: GitHub Actions naming (Scheme A)

Filename pattern: `<area>-<purpose>[-cadence].yml`

Display `name:` pattern: `"<Area>: <purpose>"`

| Prefix | Area | Meaning |
|--------|------|---------|
| `ci-` | `CI` | PR / push checks |
| `cd-` | `CD` | Deploy / promote |
| `ops-` | `Ops` | Reliability / secrets |
| `maint-` | `Maint` | Housekeeping |

## Inventory

| File | Display `name:` | Trigger |
|------|-----------------|---------|
| `ci-static-analysis.yml` | `CI: static analysis` | pull request to `main` |
| `cd-main.yml` | `CD: main` | push `main` + dispatch |
| `cd-terraform.yml` | `CD: terraform` | push `main` (`infra/**`) + dispatch |
| `maint-enable-auto-merge.yml` | `Maint: enable auto-merge` | PR opened / ready / reopened |

## Inspect

```bash
npm run lint:actions-secrets
gh workflow list --repo jefftindall/west-cherokee-properties
gh api repos/jefftindall/west-cherokee-properties/rulesets --jq ".[].name"
```
