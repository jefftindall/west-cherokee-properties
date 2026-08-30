import assert from 'node:assert/strict';
import test from 'node:test';
import { formatPhoneDisplay, normalizePhoneDigits, resolvePersonContact } from './people.js';

test('resolvePersonContact accepts email', () => {
  const contact = resolvePersonContact({ email: 'Jordan@Example.com', phone: '4045550100' });
  assert.equal(contact.emailKey, 'jordan@example.com');
  assert.equal(contact.email, 'Jordan@Example.com');
  assert.equal(contact.phone, '(404) 555-0100');
});

test('resolvePersonContact accepts phone-only contact', () => {
  const contact = resolvePersonContact({ phone: '(678) 885-7368' });
  assert.equal(contact.emailKey, 'phone:6788857368');
  assert.equal(contact.email, '');
});

test('resolvePersonContact rejects missing contact', () => {
  assert.throws(() => resolvePersonContact({}), /email or phone/);
});

test('normalizePhoneDigits strips country code', () => {
  assert.equal(normalizePhoneDigits('1-404-555-0100'), '4045550100');
  assert.equal(formatPhoneDisplay('4045550100'), '(404) 555-0100');
});
