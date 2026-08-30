/** Unit defaults and filled-field assembly for the Georgia residential lease. */

export const PET_RENT_CENTS = 2000;

export const WCP_LEASE_DEFAULTS = {
  nsfFee: '$50.00',
  lateGraceDays: '3',
  lateFee: '$50.00',
  keyCount: '2',
  mailboxKeyCount: '0',
  keyReplacementFee: '$50.00',
  lockoutFee: '$75.00',
  parkingSpaces: '2',
  saleNoticeDays: '60',
  landlordSignerName: 'Jeffrey Tindall',
};

const SMOKING_DOWNTOWN =
  'Smoking is prohibited in any area in or on the Premises and on the Property, both private and common, whether enclosed or outdoors. This policy applies to all owners, tenants, guests, employees, and servicepersons.';

const SMOKING_FALCON =
  'Smoking is not permitted inside the leased Premises. Smoking is authorized only outside the Premises at least 10 feet from all entrances and exits, including those of other tenants.';

const STORAGE_NONE =
  'No additional storage space outside the Premises is provided or authorized by this Lease.';

const STORAGE_FALCON_B =
  'A shed is located in the back yard for storage use, if desired. Landlord is not responsible for damage or theft related to integrity, location, or any use of the shed for storage. No other storage space outside the Premises is provided or authorized by this Lease.';

const STORAGE_NOBLE =
  'During the term of this lease, Tenant shall be entitled to store items of personal property in the laundry room beneath the unit. The right to that storage space is included in the Rent. Tenant shall store only personal property Tenant owns, and shall not store property claimed by another or in which another has any right, title, or interest. Tenant shall not store any improperly packaged food or perishable goods, flammable materials, explosives, hazardous waste or other inherently dangerous material, or illegal substances. Landlord shall not be liable for loss of, or damage to, any stored items.';

const YARD_FALCON = 'Yard maintenance (mowing, weed-eating, edging, and trimming of bushes).';

const YARD_CHEROKEE =
  'Yard maintenance (mowing, weed-eating, edging, and trimming of bushes). Tenant will share responsibility for maintaining a clean common courtyard area behind the house.';

const YARD_NOBLE = 'None. Landlord maintains the Premises, including the yard.';

const LEAD_PRE_1978 =
  'Many homes and apartments built before 1978 have paint that contains lead (called lead-based paint). Lead from paint chips and dust can pose serious health hazards if not taken care of properly. Federal law requires that tenants and lessees receive certain information before renting pre-1978 housing. By signing this Agreement, Tenant represents and agrees that Landlord has provided Tenant with such information, including, but not limited to, the EPA booklet entitled Protect Your Family from Lead in Your Home. Exhibit B is part of this Agreement.';

const LEAD_CONFIRM_YEAR =
  'Confirm the year the Premises were built before omitting Exhibit B. Until then, Exhibit B is attached.';

const UTILITY_ALL = 'Tenant pays all utilities and services.';

const UTILITY_FALCON_B =
  'Bartow County for water and Georgia Power for electricity. Tenant pays all other utilities and services.';

export const UNIT_LEASE_DEFAULTS = {
  'unit-10-falcon-a': {
    premisesType: 'Duplex',
    premisesAddress: '10 A Falcon Circle, Cartersville, Georgia 30121',
    maxOccupants: 2,
    storageTerms: STORAGE_NONE,
    parkingDescription: 'paved parking in front of the duplex',
    parkingSpecial: '',
    smokingPolicy: SMOKING_FALCON,
    tenantMaintenance: YARD_FALCON,
    utilitiesNotes: UTILITY_ALL,
    leadDisclosureSentence: LEAD_CONFIRM_YEAR,
    includeLeadExhibit: true,
  },
  'unit-10-falcon-b': {
    premisesType: 'Duplex',
    premisesAddress: '10 B Falcon Circle, Cartersville, Georgia 30121',
    maxOccupants: 2,
    storageTerms: STORAGE_FALCON_B,
    parkingDescription: 'paved shared parking in front of the duplex as well as a back driveway',
    parkingSpecial: ', except that Tenant is permitted to use the back driveway for boat parking',
    smokingPolicy: SMOKING_FALCON,
    tenantMaintenance: YARD_FALCON,
    utilitiesNotes: UTILITY_FALCON_B,
    leadDisclosureSentence: LEAD_CONFIRM_YEAR,
    includeLeadExhibit: true,
  },
  'unit-124-w-cherokee-a': {
    premisesType: 'Duplex',
    premisesAddress: '124 A W Cherokee Avenue, Cartersville, Georgia 30120',
    maxOccupants: 3,
    storageTerms: STORAGE_NONE,
    parkingDescription: '124 A under awning',
    parkingSpecial: '',
    smokingPolicy: SMOKING_DOWNTOWN,
    tenantMaintenance: YARD_CHEROKEE,
    utilitiesNotes: UTILITY_ALL,
    leadDisclosureSentence: LEAD_PRE_1978,
    includeLeadExhibit: true,
  },
  'unit-124-w-cherokee-b': {
    premisesType: 'Duplex',
    premisesAddress: '124 B W Cherokee Avenue, Cartersville, Georgia 30120',
    maxOccupants: 3,
    storageTerms: STORAGE_NONE,
    parkingDescription: '124 B',
    parkingSpecial: '',
    smokingPolicy: SMOKING_DOWNTOWN,
    tenantMaintenance: YARD_CHEROKEE,
    utilitiesNotes: UTILITY_ALL,
    leadDisclosureSentence: LEAD_PRE_1978,
    includeLeadExhibit: true,
  },
  'unit-11-noble': {
    premisesType: 'Single-family dwelling',
    premisesAddress: '11 Noble Street, Cartersville, Georgia 30120',
    maxOccupants: 3,
    storageTerms: STORAGE_NOBLE,
    parkingDescription: '2 spaces beside the apartment',
    parkingSpecial: '',
    smokingPolicy: SMOKING_DOWNTOWN,
    tenantMaintenance: YARD_NOBLE,
    utilitiesNotes: UTILITY_ALL,
    leadDisclosureSentence: LEAD_PRE_1978,
    includeLeadExhibit: true,
  },
};

export function formatMoney(cents) {
  const value = Number(cents);
  if (!Number.isFinite(value)) return '$0.00';
  return `$${(value / 100).toFixed(2)}`;
}

export function petRentCents(petCount) {
  const count = Number(petCount);
  if (!Number.isInteger(count) || count < 0) return 0;
  return count * PET_RENT_CENTS;
}

export function monthlyChargeCents(rentCents, petCount) {
  return Number(rentCents) + petRentCents(petCount);
}

function asNameList(value) {
  if (Array.isArray(value)) {
    return value.map((name) => String(name || '').trim()).filter(Boolean);
  }
  return String(value || '')
    .split(/\r?\n|,/)
    .map((name) => name.trim())
    .filter(Boolean);
}

export function normalizeLeaseTerms(input = {}) {
  const tenantNames = asNameList(input.tenantNames);
  const petCount = Number(input.petCount);
  if (input.petCount != null && input.petCount !== '' && (!Number.isInteger(petCount) || petCount < 0 || petCount > 8)) {
    const err = new Error('petCount must be an integer from 0 to 8');
    err.name = 'ValidationError';
    throw err;
  }
  const maxOccupants = Number(input.maxOccupants);
  if (
    input.maxOccupants != null &&
    input.maxOccupants !== '' &&
    (!Number.isInteger(maxOccupants) || maxOccupants < 1 || maxOccupants > 12)
  ) {
    const err = new Error('maxOccupants must be an integer from 1 to 12');
    err.name = 'ValidationError';
    throw err;
  }
  const securityDepositCents = Number(input.securityDepositCents);
  if (
    input.securityDepositCents != null &&
    input.securityDepositCents !== '' &&
    (!Number.isInteger(securityDepositCents) || securityDepositCents < 1)
  ) {
    const err = new Error('securityDepositCents must be a positive integer');
    err.name = 'ValidationError';
    throw err;
  }
  return {
    tenantNames,
    authorizedOccupants: String(input.authorizedOccupants || tenantNames.join('\n')).trim(),
    coTenants: Array.isArray(input.coTenants)
      ? input.coTenants
          .map((row) => ({
            personId: String(row?.personId || '').trim() || undefined,
            displayName: String(row?.displayName || '').trim(),
            email: String(row?.email || '').trim(),
            emailKey: String(row?.emailKey || '').trim(),
            phone: String(row?.phone || '').trim(),
          }))
          .filter((row) => row.displayName)
      : undefined,
    additionalOccupants: Array.isArray(input.additionalOccupants)
      ? input.additionalOccupants
          .map((row) => ({
            name: String(row?.name || '').trim(),
            relationship: String(row?.relationship || '').trim(),
          }))
          .filter((row) => row.name && row.relationship)
      : undefined,
    maxOccupants: Number.isInteger(maxOccupants) && maxOccupants >= 1 ? maxOccupants : undefined,
    securityDepositCents: Number.isInteger(securityDepositCents) && securityDepositCents > 0 ? securityDepositCents : undefined,
    petCount: Number.isInteger(petCount) && petCount >= 0 ? petCount : 0,
    approvedPets: String(input.approvedPets || (petCount > 0 ? '' : 'None')).trim() || 'None',
    additionalProvisions: String(input.additionalProvisions || 'None.').trim() || 'None.',
    landlordSignerName: String(input.landlordSignerName || WCP_LEASE_DEFAULTS.landlordSignerName).trim(),
    effectiveDate: String(input.effectiveDate || '').trim(),
  };
}

export function defaultTermsForUnit(unitId, extras = {}) {
  const unit = UNIT_LEASE_DEFAULTS[unitId] || {};
  return normalizeLeaseTerms({
    tenantNames: extras.tenantNames || extras.displayName || '',
    authorizedOccupants: extras.authorizedOccupants || extras.displayName || '',
    coTenants: extras.coTenants,
    additionalOccupants: extras.additionalOccupants,
    maxOccupants: extras.maxOccupants || unit.maxOccupants || 2,
    securityDepositCents: extras.securityDepositCents || extras.rentCents,
    petCount: extras.petCount ?? 0,
    approvedPets: extras.approvedPets || 'None',
    additionalProvisions: extras.additionalProvisions || 'None.',
    landlordSignerName: extras.landlordSignerName,
    effectiveDate: extras.effectiveDate || extras.startDate || '',
  });
}

function formatDate(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  const date = new Date(`${text}T00:00:00`);
  if (Number.isNaN(date.getTime())) return text;
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function assembleLeaseFields({ lease, person } = {}) {
  const unitId = lease?.unitId || '';
  const unit = UNIT_LEASE_DEFAULTS[unitId] || {};
  const terms = normalizeLeaseTerms(lease?.terms || {});
  const names = terms.tenantNames.length ? terms.tenantNames : asNameList(person?.displayName);
  const petCount = terms.petCount || 0;
  const rentCents = Number(lease?.rentCents) || 0;
  const depositCents = terms.securityDepositCents || rentCents;
  const maxOccupants = terms.maxOccupants || unit.maxOccupants || 2;
  return {
    effective_date: formatDate(terms.effectiveDate || lease?.startDate),
    tenant_names: names.join('\n'),
    premises_type: unit.premisesType || 'Dwelling',
    premises_address: unit.premisesAddress || '',
    commencement_date: formatDate(lease?.startDate),
    termination_date: formatDate(lease?.endDate),
    monthly_rent: formatMoney(rentCents),
    pet_count: String(petCount),
    approved_pets: terms.approvedPets || 'None',
    pet_rent: formatMoney(petRentCents(petCount)),
    total_monthly_rent: formatMoney(monthlyChargeCents(rentCents, petCount)),
    security_deposit: formatMoney(depositCents),
    nsf_fee: WCP_LEASE_DEFAULTS.nsfFee,
    late_grace_days: WCP_LEASE_DEFAULTS.lateGraceDays,
    late_fee: WCP_LEASE_DEFAULTS.lateFee,
    max_occupants: String(maxOccupants),
    authorized_occupants: terms.authorizedOccupants || names.join('\n'),
    key_count: WCP_LEASE_DEFAULTS.keyCount,
    mailbox_key_count: WCP_LEASE_DEFAULTS.mailboxKeyCount,
    key_replacement_fee: WCP_LEASE_DEFAULTS.keyReplacementFee,
    lockout_fee: WCP_LEASE_DEFAULTS.lockoutFee,
    storage_terms: unit.storageTerms || STORAGE_NONE,
    parking_spaces: WCP_LEASE_DEFAULTS.parkingSpaces,
    parking_description: unit.parkingDescription || '',
    parking_special: unit.parkingSpecial || '',
    smoking_policy: unit.smokingPolicy || SMOKING_DOWNTOWN,
    tenant_maintenance: unit.tenantMaintenance || YARD_FALCON,
    utilities_notes: unit.utilitiesNotes || UTILITY_ALL,
    sale_notice_days: WCP_LEASE_DEFAULTS.saleNoticeDays,
    early_termination_fee: formatMoney(rentCents * 2),
    destruction_repair_threshold: formatMoney(depositCents),
    lead_disclosure_sentence: unit.leadDisclosureSentence || LEAD_PRE_1978,
    additional_provisions: terms.additionalProvisions || 'None.',
    landlord_signer_name: terms.landlordSignerName || WCP_LEASE_DEFAULTS.landlordSignerName,
    landlord_sign_date: '',
    tenant_1_name: names[0] || '',
    tenant_1_sign_date: '',
    tenant_2_name: names[1] || 'N/A',
    tenant_2_sign_date: names[1] ? '' : 'N/A',
    tenant_3_name: names[2] || 'N/A',
    tenant_3_sign_date: names[2] ? '' : 'N/A',
    inspection_date: '',
    inspection_extra_1: '',
    inspection_extra_2: '',
    year_built: '',
    lead_known_explain: '',
    lead_records_list: '',
  };
}

export function documentFilename(lease, unit) {
  const address = (unit?.premisesAddress || lease?.unitId || 'lease')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  const start = String(lease?.startDate || 'current').slice(0, 10);
  return `wcp-lease-${address}-${start}.html`;
}
