# Legal templates

**Audience:** Staff preparing leases and legal notices in `/office`; renters downloading leases from `/portal`  
**Last updated:** 2026-08-30  

## Documents

| Document | Template | Office route |
|----------|----------|--------------|
| Georgia residential lease | [georgia-residential-lease-template.md](./georgia-residential-lease-template.md) | `/office/leases/{id}` |
| Notice to pay rent or quit (7-day) | [georgia-eviction-notice-template.md](./georgia-eviction-notice-template.md) | `/office/legal-document?leaseId=&type=eviction-notice` |
| Affidavit of service (personal) | [georgia-affidavit-of-service-template.md](./georgia-affidavit-of-service-template.md) | `/office/legal-document?leaseId=&type=affidavit-of-service` |

Implementation plan: [legal-documents.md](../plans/legal-documents.md).

---

# Lease template

**Audience:** Staff preparing a lease in `/office`; renters downloading from `/portal`  
**Last updated:** 2026-08-29  
**Source of truth:** [georgia-residential-lease-template.md](./georgia-residential-lease-template.md)  
**Runtime copy (Functions):** [`api/src/lib/georgia-residential-lease-template.md`](../../api/src/lib/georgia-residential-lease-template.md) — keep these two files identical  
**Signing:** In-app eSign is planned — [lease-esign.md](../plans/lease-esign.md). Until then, print and sign in person. Office and the renter can download the current copy.

Master Georgia residential lease for West Cherokee Properties, LLC. Derived from executed leases for 10 Falcon Circle A/B, 124 W Cherokee A/B, and 11 Noble Street (2022–2026). No executed PDF or tenant name belongs in this folder.

Staff prepare the lease in the office app, print it, and sign in person. Office and the renter can both download the current filled copy. eSign is optional later. This is not a substitute for attorney review. Do not collect SSN or protected-class fields on the lease or application.

## How to issue a lease

1. In `/office/leases`, pick a vacant unit. Unit defaults (parking, storage, smoking, utilities, yard, lead) fill in.
2. Enter the household, dates, dwelling rent, deposit, occupants, and pet count.
3. Save. Print the document and sign in person. Extra signature lines: write N/A.
4. Office and the renter download the same current copy from `/office/leases` and `/portal/lease`.
5. Keep wet-ink originals out of this repo.

`{{double_curly}}` names are the merge map. The app fills them; you do not copy the markdown by hand.

## West Cherokee defaults (all units)

| Item | Value |
|------|--------|
| Landlord / manager | WEST CHEROKEE PROPERTIES, LLC |
| Notices | 227 W Cherokee Ave, Cartersville, Georgia 30120-3003 |
| Phone | 678-885-7368 |
| Email | info@westcherokee.com |
| Deposit bank | **Southern States Bank**, 215 East Main Street, Cartersville, Georgia 30120. Century Bank of Georgia was sold into Southern States Bank in 2024. That successor is not FirstBank. |
| Rent due | 1st of the month; delinquent the next day |
| Payment | Personal check, money order, cashier's check, ACH / portal. No cash. |
| NSF fee | $50.00 |
| Late grace / fee | 3 days / $50.00 |
| Keys | 2 unit keys, 0 mailbox keys; $50 if not returned |
| Lockout | $75.00 |
| Sale notice | 60 days |
| Early termination | 60 days' notice + fee of **two months' dwelling rent** |
| Destruction threshold | Same amount as the security deposit |
| Pets | Allowed with written approval; **$20.00 per pet per month** additional Rent. Assistance animals are not pets and are not charged. |
| Pest | Quarterly treatment by Landlord; extra treatments billed to Tenant |
| Holdover | Month-to-month if Landlord accepts rent after the end date |
| Dispute resolution | Negotiation, then mediation, then court — not binding AAA arbitration |
| Landlord signer | Jeffrey Tindall unless another authorized signer is named |

## Canned clause text

The office app applies these when you pick a unit. Override only if this tenancy is different.

### `{{storage_terms}}`

- **None (124 A/B, Falcon A):** `No additional storage space outside the Premises is provided or authorized by this Lease.`
- **10 Falcon Circle B shed:** `A shed is located in the back yard for storage use, if desired. Landlord is not responsible for damage or theft related to integrity, location, or any use of the shed for storage. No other storage space outside the Premises is provided or authorized by this Lease.`
- **11 Noble laundry room:** `During the term of this lease, Tenant shall be entitled to store items of personal property in the laundry room beneath the unit. The right to that storage space is included in the Rent. Tenant shall store only personal property Tenant owns, and shall not store property claimed by another or in which another has any right, title, or interest. Tenant shall not store any improperly packaged food or perishable goods, flammable materials, explosives, hazardous waste or other inherently dangerous material, or illegal substances. Landlord shall not be liable for loss of, or damage to, any stored items.`

### `{{parking_special}}`

- **No boats / trailers (default):** leave empty.
- **10 Falcon Circle B boat:** `, except that Tenant is permitted to use the back driveway for boat parking`

### `{{smoking_policy}}`

- **Downtown (124 W Cherokee, 11 Noble):** `Smoking is prohibited in any area in or on the Premises and on the Property, both private and common, whether enclosed or outdoors. This policy applies to all owners, tenants, guests, employees, and servicepersons.`
- **Falcon Circle:** `Smoking is not permitted inside the leased Premises. Smoking is authorized only outside the Premises at least 10 feet from all entrances and exits, including those of other tenants.`

### `{{tenant_maintenance}}`

- **Falcon:** `Yard maintenance (mowing, weed-eating, edging, and trimming of bushes).`
- **124 W Cherokee:** `Yard maintenance (mowing, weed-eating, edging, and trimming of bushes). Tenant will share responsibility for maintaining a clean common courtyard area behind the house.`
- **11 Noble:** `None. Landlord maintains the Premises, including the yard.`

### `{{lead_disclosure_sentence}}`

- **Pre-1978 (124 W Cherokee; 11 Noble):** `Many homes and apartments built before 1978 have paint that contains lead (called lead-based paint). Lead from paint chips and dust can pose serious health hazards if not taken care of properly. Federal law requires that tenants and lessees receive certain information before renting pre-1978 housing. By signing this Agreement, Tenant represents and agrees that Landlord has provided Tenant with such information, including, but not limited to, the EPA booklet entitled Protect Your Family from Lead in Your Home. Exhibit B is part of this Agreement.`
- **Post-1978 only after year built is confirmed:** `The Premises were built in {{year_built}}. Exhibit B is not required for this tenancy.`

Prior downtown leases checked: Landlord has no knowledge of lead-based paint or hazards, and no records or reports. Confirm before each signing. Confirm year built for Falcon Circle before omitting Exhibit B.

### `{{additional_provisions}}`

Write `None.` when there is nothing extra. Use this block for a multi-year rent schedule. Do not put a second rent ledger here — Stripe remains the money system of record. Pet rent is already in the Pets and Rent sections.

## Unit defaults

Structural only. Do not copy current tenant names or current rent into a new lease from this table.

| Unit | `{{premises_type}}` | `{{premises_address}}` | Beds | `{{max_occupants}}` guidance | Parking | Storage | Smoking | Yard | Utilities | Lead exhibit |
|------|---------------------|------------------------|------|------------------------------|---------|---------|---------|------|-----------|--------------|
| 10 Falcon Circle A | Duplex | 10 A Falcon Circle, Cartersville, Georgia 30121 | 2 | 2 | paved parking in front of the duplex | None | Falcon outdoor 10 ft | Tenant | Tenant pays all utilities and services. | Confirm year built |
| 10 Falcon Circle B | Duplex | 10 B Falcon Circle, Cartersville, Georgia 30121 | 2 | 2 | paved shared parking in front of the duplex as well as a back driveway; boat OK in back driveway | Shed | Falcon outdoor 10 ft | Tenant | Bartow County for water and Georgia Power for electricity. Tenant pays all other utilities and services. | Confirm year built |
| 124 W Cherokee A | Duplex | 124 A W Cherokee Avenue, Cartersville, Georgia 30120 | 2 | 2–3 | 124 A under awning | None | Downtown prohibited | Tenant + courtyard | Tenant pays all utilities and services. | Yes |
| 124 W Cherokee B | Duplex | 124 B W Cherokee Avenue, Cartersville, Georgia 30120 | 3 | 3 | 124 B | None | Downtown prohibited | Tenant + courtyard | Tenant pays all utilities and services. | Yes |
| 11 Noble St | Single-family dwelling | 11 Noble Street, Cartersville, Georgia 30120 | 2 | 3 | 2 spaces beside the apartment | Laundry room beneath the unit | Downtown prohibited | Landlord | Tenant pays all utilities and services. | Yes |

## Merge field catalog

| Field | Required | Notes |
|-------|----------|--------|
| `{{effective_date}}` | yes | Signing date |
| `{{tenant_names}}` | yes | One name per line; all adult signers |
| `{{premises_type}}` | yes | Duplex or Single-family dwelling |
| `{{premises_address}}` | yes | Full street, city, state, ZIP |
| `{{commencement_date}}` | yes | Possession start |
| `{{termination_date}}` | yes | Last day of term |
| `{{monthly_rent}}` | yes | Dwelling rent only, e.g. $1,575.00 |
| `{{pet_count}}` | yes | Integer; 0 if none |
| `{{approved_pets}}` | yes | `None` or a short description |
| `{{pet_rent}}` | yes | $20.00 × pet count |
| `{{total_monthly_rent}}` | yes | Dwelling rent + pet rent (what Stripe should invoice) |
| `{{security_deposit}}` | yes | Prior leases were about 1–2 months' dwelling rent |
| `{{nsf_fee}}` | yes | $50.00 |
| `{{late_grace_days}}` | yes | 3 |
| `{{late_fee}}` | yes | $50.00 |
| `{{max_occupants}}` | yes | Integer |
| `{{authorized_occupants}}` | yes | Named people, including children who will live there |
| `{{key_count}}` | yes | 2 |
| `{{mailbox_key_count}}` | yes | 0 |
| `{{key_replacement_fee}}` | yes | $50.00 |
| `{{lockout_fee}}` | yes | $75.00 |
| `{{storage_terms}}` | yes | Unit canned text |
| `{{parking_spaces}}` | yes | 2 |
| `{{parking_description}}` | yes | Unit table |
| `{{parking_special}}` | no | Empty, or Falcon B boat clause |
| `{{smoking_policy}}` | yes | Downtown vs Falcon |
| `{{tenant_maintenance}}` | yes | Unit canned text |
| `{{utilities_notes}}` | yes | Unit table |
| `{{sale_notice_days}}` | yes | 60 |
| `{{early_termination_fee}}` | yes | Two months' dwelling rent |
| `{{destruction_repair_threshold}}` | yes | Same as security deposit |
| `{{lead_disclosure_sentence}}` | yes | Canned text above |
| `{{additional_provisions}}` | yes | `None.` or a specific add-on |
| `{{landlord_signer_name}}` | yes | Usually Jeffrey Tindall |
| `{{landlord_sign_date}}` | wet-ink / eSign | Leave blank for in-person signing |
| `{{tenant_1_name}}` / `_sign_date` | yes | First adult |
| `{{tenant_2_name}}` / `_sign_date` | if 2+ | N/A if unused |
| `{{tenant_3_name}}` / `_sign_date` | if 3+ | N/A if unused |
| `{{inspection_date}}` | move-in | Exhibit A |
| `{{inspection_extra_1}}` / `_2` | no | Extra checklist rows |
| `{{year_built}}` | if post-1978 | Only when omitting Exhibit B |
| `{{lead_known_explain}}` | if (a)(i) | Exhibit B |
| `{{lead_records_list}}` | if (b)(i) | Exhibit B |

## What was standardized (and why)

The source PDFs are the same Georgia residential form. Dollar amounts, grace periods, and a few policies drifted by year and address.

| Topic | What the source leases did | This template |
|-------|----------------------------|---------------|
| Office phone | 770-548-0135 on some Falcon copies; 678-885-7368 on 124 and 11 Noble | 678-885-7368 (public site) |
| Deposit bank | Century Bank on older 124 / Noble copies. After the 2024 sale, the Nov 2024 Falcon A lease already said Southern States Bank at the same Main Street address. One later Falcon PDF printed FirstBank there — that is a different bank. | **Southern States Bank**. Century Bank of Georgia was sold into Southern States Bank. That is not FirstBank. |
| Cash rent | Allowed on some Falcon copies; omitted on 124 | Omitted |
| NSF / late / keys / lockout | Drifted | $50 NSF; 3 days / $50 late; $50 keys; $75 lockout |
| Sale notice | 90 days Falcon; 60 days 124; blank on 11 Noble | 60 days |
| Early-out fee | About two months' rent | Two months' dwelling rent |
| Holdover | Falcon: vacate unless a new writing; 124 and 11 Noble: month-to-month if rent accepted | 124 / Noble holdover |
| Pets | 124B said no pets; others silent | Pets allowed; $20 / pet / month; assistance animals carved out |
| Smoking | Falcon: outdoor 10 ft; downtown: nowhere on the property | Unit canned text |
| 11 Noble extras | Laundry-room storage; 2 spaces beside the apartment; Landlord yards; max 3 occupants; lead exhibit | Those defaults |
| Pest | Mixed | Quarterly Landlord + extra Tenant |
| Destruction clause | Missing or $0 threshold on some | Always included; threshold = deposit |
| ADR | Most: mediation then court. One 124 lease: AAA | Mediation then court |
| Lead | On 124 and 11 Noble | Exhibit B for pre-1978 |

## Do not put in git

Executed PDFs, tenant names, emails, phones, or filled dollar amounts for a live tenancy. Rotate any secret that lands in chat or CI per [rotate-secrets.md](../runbooks/rotate-secrets.md).

## Eviction notice merge fields

| Field | Required | Notes |
|-------|----------|--------|
| `{{notice_date}}` | yes | Date notice is issued |
| `{{tenant_name}}` | yes | Primary tenant from lease household |
| `{{tenant_mailing_address}}` | yes | Premises address (unit default) |
| `{{premises_address}}` | yes | Full street, city, state, ZIP |
| `{{lease_date}}` | yes | Lease commencement |
| `{{amount_due}}` | yes | Defaults to open invoice balance |
| `{{period_start}}` / `{{period_end}}` | yes | Unpaid rent period; blank underscores if unknown |
| `{{possession_deliver_to}}` | yes | Landlord or agent; blank underscore if unset |
| `{{landlord_signer_name}}` | wet-ink | Authorized signer |
| `{{landlord_name}}` / `{{landlord_address}}` | yes | West Cherokee defaults |

## Affidavit of service merge fields

| Field | Required | Notes |
|-------|----------|--------|
| `{{server_name}}` | yes | Disinterested third party (not landlord employee related to tenant) |
| `{{service_date}}` | yes | Date of personal delivery |
| `{{document_served}}` | yes | Usually `NOTICE TO PAY RENT OR QUIT` |
| `{{recipient_name}}` / `{{recipient_address}}` | yes | Tenant name and premises (uppercase in output) |
| `{{affidavit_sign_day}}` / `_month` / `_year` | wet-ink | Server signature date |
| `{{service_city}}` / `{{service_state}}` | yes | Cartersville, Georgia |
| Notary block fields | wet-ink | County, date, notary name, title, commission expiry |
