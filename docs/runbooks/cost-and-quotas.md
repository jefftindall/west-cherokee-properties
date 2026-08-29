# Runbook: Cost and quotas

**Last updated:** 2026-08-29  
**Region:** East US 2  
**Subscription:** `5f82b068-cbaa-40bf-9d56-e9932a64a41c`  
**Budget:** `budget-wcp-monthly` ($50/mo, 80% and 100% Actual). Alert email from `kv-wcp-shared` / `ALERT-EMAIL`.

Expected retail (order-of-magnitude, two environments):

| Item | Notes | USD / mo |
|------|-------|----------|
| SWA Standard × 2 | `swa-wcp-staging`, `swa-wcp-prod` | ~18 |
| Azure SQL serverless GP_S_Gen5_1 × 2 | `sql-wcp-staging`, `sql-wcp-prod`; auto-pause 60m, min 0.5 vCore | ~12–25 when idle most of the month |
| Key Vault × 3 | `kv-wcp-shared`, `kv-wcp-staging`, `kv-wcp-prod` | ~1 |
| Log Analytics + App Insights × 2 | 1 GB/day cap | ~2 |
| Budget buffer | — | — |

**Subscription budget** (bootstrap): **$50/mo** = ceil(expected × 1.25) with 80% Actual alert to `ALERT-EMAIL`.

Recalculate this table when adding a billable SKU and update the budget in the same PR (`infra/bootstrap/budget.tf`, `subscription_budget_usd`).

```bash
az account set --subscription 5f82b068-cbaa-40bf-9d56-e9932a64a41c

az consumption budget list --query "[].{name:name,amount:amount,timeGrain:timeGrain}" -o table
az consumption budget show --budget-name budget-wcp-monthly -o json --query "{name:name,amount:amount,currentSpend:currentSpend}"

# Resource groups we expect to pay for
az group list --query "[?starts_with(name, 'rg-wcp-')].{name:name,location:location}" -o table

az resource list --resource-group rg-wcp-shared --query "[].{name:name,type:type}" -o table
az resource list --resource-group rg-wcp-staging --query "[].{name:name,type:type}" -o table
az resource list --resource-group rg-wcp-prod --query "[].{name:name,type:type}" -o table
```

Change the dollar amount only through Terraform (do not `az consumption budget create` by hand unless bootstrap is gone):

```bash
cd infra/bootstrap
terraform plan -input=false -out=tfplan
terraform apply tfplan
```
