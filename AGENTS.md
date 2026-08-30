See README.md and docs/ for project guidance.

## Cursor Cloud specific instructions

Astro property-management site + Azure Functions API. Node >= 22.12 is required (see root `package.json` engines). Cloud agent runtime is defined in [`.cursor/environment.json`](.cursor/environment.json): the `install` script runs `npm ci` for the root site and `api/`. Bake Node, Terraform (>= 1.5), TFLint (`tflint --init` in `infra/`), and Azure CLI (`az`) into the Cursor Cloud environment **snapshot**. Azure Functions Core Tools (`func`) may be present on the base/snapshot image but is **not** part of `install`. The `site` terminal starts Astro on port 4321.

### No local deploys

**Do not apply Terraform, deploy SWA, or mutate Azure env resources unless the user explicitly asks in that conversation.** Open a PR. After merge, `CD: main` deploys the site and `CD: terraform` applies staging/prod. See [`.cursor/rules/no-local-deploy.mdc`](.cursor/rules/no-local-deploy.mdc).

### Lint and static analysis (required before commit)

**Agents must run local static analysis before committing or pushing code:**

```bash
npm run lint
```

This mirrors the PR gate workflow [`.github/workflows/ci-static-analysis.yml`](.github/workflows/ci-static-analysis.yml). Do not commit if lint fails; do not skip these checks.

### Terraform stack direction

**Only bootstrap → environments.** `infra/bootstrap` creates shared resources (`kv-wcp-shared`, OIDC, budget, Stripe API keys). Staging/prod **consume** them by well-known name (`data.azurerm_key_vault.shared`).

**Never environments → bootstrap.** See [`.cursor/rules/terraform-stack-direction.mdc`](.cursor/rules/terraform-stack-direction.mdc).

### Data persistence documentation

[`docs/architecture/data-persistence.md`](docs/architecture/data-persistence.md) is the architecture SoT. When a PR changes a durable store, schema, or access path, update that document in the same PR.

### Never echo secrets

Never print secret values in workflows or scripts. See [`.cursor/rules/never-echo-secrets.mdc`](.cursor/rules/never-echo-secrets.mdc). If leaked, rotate immediately ([rotate-secrets.md](docs/runbooks/rotate-secrets.md)).

### Brand

West Cherokee Properties is a **rental property management** business with homes in Cartersville, Georgia: 124 W Cherokee Ave (Units A and B), 11 Noble St (single unit; same tax parcel and policies as 124 W Cherokee), and 10 Falcon Circle (Units A and B). Tone: trustworthy, local, residential. Do not copy Broadway/theatre visual language.

### Office and portal

- `/office` is staff-only (workforce Entra). `/portal` is renters (Entra External ID). Authn ≠ authz.
- Fair housing: one application form for everyone. Do not collect SSN or protected-class fields.
- Stripe is the money system of record. Do not invent a second ledger.
