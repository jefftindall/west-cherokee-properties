# Waitlist (backlog)

**Audience:** Agents, implementers  
**Last updated:** 2026-08-29  
**Status:** planned  
**Depends on:** public apply only when a unit is `available` (done), Azure SQL when durable storage is required

People who like a specific address should be able to raise a hand **before** that unit is vacant. This is not a rental application and must not collect SSN or protected-class fields. Fair housing: one waitlist form for everyone, scoped to a property (not a secret side door).

## Why

Every unit is leased today. The public site closes `/apply` until a unit is marked available in git (`src/content/properties`) and `api/src/lib/propertySeed.js`. Contact can take informal interest now. A waitlist is the durable, per-property follow-up.

## Actions

| ID | Status | Work |
|----|--------|------|
| WL-01 | planned | SQL `waitlist_entries` (person + property slug + created_at + status). Update `docs/architecture/data-persistence.md` in the same PR. |
| WL-02 | planned | Public “keep me in mind for this home” form on property pages and `/apply` when that property has no vacancy. Turnstile. Same fields we already trust: name, email, phone, optional note. |
| WL-03 | planned | Office queue: list/filter by property, mark contacted or withdrawn. Catalog permission, not “anyone with a login”. |
| WL-04 | planned | When a unit flips to `available`, office can email the waitlist for that property. Do not invent a second money ledger. |

## Acceptance criteria

- [ ] A visitor can join a waitlist for **one named property** without submitting a rental application.
- [ ] The form is hidden or disabled only if we later choose a cap; default is open while the unit is leased.
- [ ] Opening applications (`available: true`) does not auto-approve anyone on the waitlist. They still use the one application form.
- [ ] Office can see who is waiting for which address and record that we emailed them.
- [ ] No SSN, no protected-class questions, no separate process by property beyond the address they picked.

## Out of scope

- Ranking, deposits, or “first in line gets the key”.
- SMS unless we already have a reviewed messaging path.
- Prod SQL until the subscription can provision Azure SQL.

## Revision notes

- 2026-08-29: Added after the public site stopped taking applications while all five units are leased.
