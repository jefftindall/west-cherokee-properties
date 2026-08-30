export type OfficePerson = {
  id: string;
  displayName: string;
  email?: string;
  emailKey?: string;
  phone?: string;
};

export function formatPersonContact(person: OfficePerson) {
  if (person.email) return person.email;
  if (person.phone) return person.phone;
  if (person.emailKey?.startsWith('phone:')) {
    const digits = person.emailKey.slice('phone:'.length);
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return digits;
  }
  return '';
}

export function formatPersonLabel(person: OfficePerson) {
  const contact = formatPersonContact(person);
  return contact ? `${person.displayName} · ${contact}` : person.displayName;
}

export function renterSelectOptions(people: OfficePerson[], excludeIds: string[] = []) {
  const blocked = new Set(excludeIds);
  return people
    .filter((person) => !blocked.has(person.id))
    .map(
      (person) =>
        `<option value="${person.id}">${formatPersonLabel(person).replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</option>`,
    )
    .join('');
}
