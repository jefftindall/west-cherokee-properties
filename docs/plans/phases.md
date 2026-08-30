# Phased delivery

_Last updated: 2026-08-30. Azure SQL is in Central US (East US / East US 2 still `ProvisioningDisabled`). Env Terraform applies via `CD: terraform` after merge. Public site closed applications while all units are leased. Waitlist is backlog. Lease prepare/print/download exists; in-app eSign (Entra + emailed code, every adult signs) is planned. Office operations portal (dashboard, automated billing, renewals, digest, workflow paging) is planned — [office-operations.md](./office-operations.md)._

| Phase | Status | Notes |
|-------|--------|-------|
| 1 Repo foundation | done | Astro, lint, CI, Playwright, AGENTS |
| 2 Azure infrastructure | done | Terraform bootstrap/staging/prod, `wcp` prefix |
| 3 Public marketing site | done | Home, properties, about, contact, style guide |
| 4 Identity | done | Workforce Entra + External ID login chooser, permission catalog. SWA Easy Auth `AAD_*` app settings are Terraform-managed (2026-08-30) |
| 5 Operational data | done | Azure SQL schema + memory store for tests |
| 6 Rental applications | done | Public apply + office queue. Form and API accept applications only when a unit is `available` |
| Waitlist | planned | Per-property interest list while homes are leased — [waitlist.md](./waitlist.md) |
| Lease documents | in_progress | Prepare + download exist. In-app eSign (not a vendor): third-party login plus emailed code; each adult signs — [lease-esign.md](./lease-esign.md) |
| 7 Renters and leases | done | One active lease per unit; portal read |
| 8 Invoices, payments, receipts | done | Stripe Invoice + webhook; feature flag |
| 9 Service requests | done | Portal create; office triage |
| 10 Release hardening | done | CD build-once, smoke, budget, runbooks |
| Office operations | planned | Dashboard R/Y/G, automated billing/comms, renewals, maintenance costs, weekly digest, workflow paging — [office-operations.md](./office-operations.md) |
