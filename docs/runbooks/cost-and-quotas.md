# Runbook: Cost and quotas

**Last updated:** 2026-08-28  
**Region:** East US 2

Expected retail (order-of-magnitude, two environments):

| Item | Notes | USD / mo |
|------|-------|----------|
| SWA Standard × 2 | Staging + prod | ~18 |
| Azure SQL serverless GP_S_Gen5_1 × 2 | Auto-pause 60m, min 0.5 vCore | ~12–25 when idle most of the month |
| Key Vault × 3 | Shared + env | ~1 |
| Log Analytics + App Insights × 2 | 1 GB/day cap | ~2 |
| Budget buffer | — | — |

**Subscription budget** (bootstrap): **$50/mo** = ceil(expected × 1.25) with 80% Actual alert to `ALERT-EMAIL`.

Recalculate this table when adding a billable SKU and update the budget in the same PR.
