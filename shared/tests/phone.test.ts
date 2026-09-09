import { describe, expect, it } from 'vitest';
import { isNormalisedPhone, normalisePhone } from '../src/phone.js';

describe('normalisePhone', () => {
  it('turns the everyday Swedish forms into one E.164 string', () => {
    expect(normalisePhone('070-123 45 67')).toBe('+46701234567');
    expect(normalisePhone('0701234567')).toBe('+46701234567');
    expect(normalisePhone('08-123 456')).toBe('+468123456');
  });

  it('collapses an international prefix however it was written', () => {
    expect(normalisePhone('+46 70 123 45 67')).toBe('+46701234567');
    expect(normalisePhone('0046-70-123 45 67')).toBe('+46701234567');
    expect(normalisePhone('  +46701234567')).toBe('+46701234567');
    // Someone combining both conventions: +00 46 …
    expect(normalisePhone('+0046701234567')).toBe('+46701234567');
  });

  it('keeps a non-Swedish country code as given', () => {
    expect(normalisePhone('+1 (202) 555-0143')).toBe('+12025550143');
  });

  it('assumes Swedish national form when there is no hint', () => {
    // No trunk zero, no country code — a bare subscriber number.
    expect(normalisePhone('701234567')).toBe('+46701234567');
    // Country code without the leading +.
    expect(normalisePhone('46 701 234 567')).toBe('+46701234567');
  });

  it('returns an empty string when there are no digits at all', () => {
    expect(normalisePhone('')).toBe('');
    expect(normalisePhone('---')).toBe('');
    expect(normalisePhone('+')).toBe('');
  });

  it('is idempotent — normalising a normalised number changes nothing', () => {
    const once = normalisePhone('070-123 45 67');
    expect(normalisePhone(once)).toBe(once);
  });
});

describe('isNormalisedPhone', () => {
  it('accepts a canonical E.164 number', () => {
    expect(isNormalisedPhone('+46701234567')).toBe(true);
    expect(isNormalisedPhone('+12025550143')).toBe(true);
  });

  it('rejects anything not already canonical', () => {
    expect(isNormalisedPhone('070-123 45 67')).toBe(false);
    expect(isNormalisedPhone('0701234567')).toBe(false);
    expect(isNormalisedPhone('+46')).toBe(false); // too short
    expect(isNormalisedPhone('+046701234567')).toBe(false); // leading zero country
    expect(isNormalisedPhone('46701234567')).toBe(false); // no plus
    expect(isNormalisedPhone('')).toBe(false);
  });

  it('agrees with normalisePhone on a well-formed Swedish number', () => {
    expect(isNormalisedPhone(normalisePhone('070-123 45 67'))).toBe(true);
  });
});
