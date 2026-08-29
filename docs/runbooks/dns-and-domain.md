# Runbook: DNS and domain

Intended hostnames:

| Environment | Hostname |
|-------------|----------|
| Staging | `test.westcherokee.com` |
| Production | `westcherokee.com` and `www` |

After SWA exists, add a custom domain on the Static Web App and create the DNS records Azure shows (usually a CNAME to `*.azurestaticapps.net`, plus TXT validation).

Do not commit registrar credentials. Staging must stay noindex (`scripts/apply-staging-noindex.mjs` in CD).
