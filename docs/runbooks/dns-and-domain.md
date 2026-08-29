# Runbook: DNS and domain

**Last updated:** 2026-08-29

| Environment | Hostname | SWA | Resource group |
|-------------|----------|-----|----------------|
| Staging | `test.westcherokee.com` | `swa-wcp-staging` | `rg-wcp-staging` |
| Production | `westcherokee.com` and `www.westcherokee.com` | `swa-wcp-prod` | `rg-wcp-prod` |

Do not commit registrar credentials. Staging must stay noindex (`scripts/apply-staging-noindex.mjs` in CD).

```bash
az account set --subscription 5f82b068-cbaa-40bf-9d56-e9932a64a41c

# Default *.azurestaticapps.net host (after the env stack exists)
cd infra/environments/staging
terraform output static_web_app_default_host_name
cd ../prod
terraform output static_web_app_default_host_name
```

## Attach hostnames on the Static Web App

Azure prints CNAME / TXT validation records. Those are not vault secrets.

```bash
az staticwebapp hostname set --name swa-wcp-staging --resource-group rg-wcp-staging --hostname test.westcherokee.com
az staticwebapp hostname set --name swa-wcp-prod --resource-group rg-wcp-prod --hostname westcherokee.com
az staticwebapp hostname set --name swa-wcp-prod --resource-group rg-wcp-prod --hostname www.westcherokee.com

az staticwebapp hostname list --name swa-wcp-staging --resource-group rg-wcp-staging -o table
az staticwebapp hostname list --name swa-wcp-prod --resource-group rg-wcp-prod -o table
```

At the registrar, create the records Azure shows (typically CNAME to the SWA default host, plus TXT for apex validation). Point `test.westcherokee.com` at staging only.

## Confirm

```bash
curl -sI https://test.westcherokee.com | head -n 20
curl -sI https://westcherokee.com | head -n 20
curl -s https://test.westcherokee.com/robots.txt
```

Staging `robots.txt` must `Disallow: /`. Production must allow `/` and list `https://westcherokee.com/sitemap-index.xml`.
