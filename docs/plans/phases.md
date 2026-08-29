# Phased delivery

_Last updated: 2026-08-29. Public site closed applications while all units are leased. Waitlist is backlog ([waitlist.md](./waitlist.md))._

| Phase | Status | Notes |
|-------|--------|-------|
| 1 Repo foundation | done | Astro, lint, CI, Playwright, AGENTS |
| 2 Azure infrastructure | done | Terraform bootstrap/staging/prod, `wcp` prefix |
| 3 Public marketing site | done | Home, properties, about, contact, style guide |
| 4 Identity | done | Workforce Entra + External ID login chooser, permission catalog |
| 5 Operational data | done | Azure SQL schema + memory store for tests |
| 6 Rental applications | done | Public apply + office queue. Form and API accept applications only when a unit is `available` |
| Waitlist | planned | Per-property interest list while homes are leased — [waitlist.md](./waitlist.md) |
| 7 Renters and leases | done | One active lease per unit; portal read |
| 8 Invoices, payments, receipts | done | Stripe Invoice + webhook; feature flag |
| 9 Service requests | done | Portal create; office triage |
| 10 Release hardening | done | CD build-once, smoke, budget, runbooks |
