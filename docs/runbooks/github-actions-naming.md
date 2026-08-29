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
| `ci-static-analysis.yml` | `CI: static analysis` | PR + push `main` |
| `cd-main.yml` | `CD: main` | push `main` + dispatch |
