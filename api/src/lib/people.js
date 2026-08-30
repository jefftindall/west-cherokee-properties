import { ValidationError } from './errors.js';

export function normalizePhoneDigits(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length === 10) return digits;
  return '';
}

export function formatPhoneDisplay(digits) {
  const value = normalizePhoneDigits(digits);
  if (value.length !== 10) return String(digits || '').trim();
  return `(${value.slice(0, 3)}) ${value.slice(3, 6)}-${value.slice(6)}`;
}

export function resolvePersonContact({ email = '', phone = '' } = {}) {
  const trimmedEmail = String(email || '').trim().toLowerCase();
  const phoneDigits = normalizePhoneDigits(phone);
  if (trimmedEmail && trimmedEmail.includes('@')) {
    return {
      emailKey: trimmedEmail,
      email: String(email).trim(),
      phone: phoneDigits ? formatPhoneDisplay(phoneDigits) : String(phone || '').trim(),
    };
  }
  if (phoneDigits) {
    return {
      emailKey: `phone:${phoneDigits}`,
      email: '',
      phone: formatPhoneDisplay(phoneDigits),
    };
  }
  throw new ValidationError('email or phone is required');
}

export function isSyntheticPhoneEmailKey(emailKey) {
  return String(emailKey || '').startsWith('phone:');
}
