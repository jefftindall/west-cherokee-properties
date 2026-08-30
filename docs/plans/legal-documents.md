# Legal documents (eviction notices and affidavits)

**Audience:** Agents, implementers  
**Last updated:** 2026-08-30  
**Status:** in_progress  
**Depends on:** office leases, invoices, [`docs/legal/README.md`](../legal/README.md)

Generate Georgia **notice to pay rent or quit** (seven-day) and **affidavit of service by personal delivery** from active lease data. Same pipeline as the residential lease: markdown template → merge fields → HTML → browser print / Save as PDF. Office-only; renters do not receive these documents in the portal.

## Actions

| ID | Status | Work |
|----|--------|------|
| LD-01 | done | Shared `legalDocument.js` utilities; eviction notice + affidavit templates in `docs/legal/` with runtime copies |
| LD-02 | done | `legalTerms.js` field assembly; open-balance default from unpaid invoices |
| LD-03 | done | `GET /api/office/leases/{id}/legal/{type}` for `eviction-notice` and `affidavit-of-service` |
| LD-04 | done | `/office/legal-document?leaseId=&type=` preview shell; links on `/office/leases` for active leases |
| LD-05 | planned | Counsel review of templates before first live use; record date in `docs/legal/README.md` |
| LD-06 | planned | Persist notice/service history (`legal_documents`, `service_of_process`) when lease-manage shell ships (OP-11) |

## Acceptance criteria

- [x] Staff can preview, print, and download a filled seven-day eviction notice for an active lease
- [x] Staff can preview, print, and download an affidavit of service with editable service date and server name
- [x] Amount due defaults to sum of open invoices; period defaults to oldest–newest unpaid invoice range
- [x] Runtime templates stay identical to `docs/legal/` copies
- [ ] Counsel review recorded before first live filing

## Revision notes

- 2026-08-30: Initial eviction notice and affidavit generation — templates, API, office UI, tests.
