import { describe, expect, it } from 'vitest';
import { emailSchema } from 'shared';
import { schemaValidator, validateModelYear, validateVin } from './validators';

describe('schemaValidator', () => {
  const validateEmail = schemaValidator(emailSchema);

  it('returns undefined for a value the schema accepts', () => {
    expect(validateEmail('mekaniker@verkstaden.se')).toBeUndefined();
  });

  it('returns the schema’s own Swedish message for a bad value', () => {
    expect(validateEmail('not-an-email')).toBe('Ange en giltig e-postadress.');
  });
});

describe('validateModelYear', () => {
  it('accepts a plausible year', () => {
    expect(validateModelYear('2018')).toBeUndefined();
  });

  it('rejects a year outside the bounds', () => {
    expect(validateModelYear('1899')).toBeDefined();
    expect(validateModelYear('2101')).toBeDefined();
  });

  it('rejects a non-integer', () => {
    expect(validateModelYear('2018.5')).toBeDefined();
    expect(validateModelYear('abc')).toBeDefined();
  });
});

describe('validateVin', () => {
  it('accepts a value within the length bounds', () => {
    expect(validateVin('YV1AAAAA1A1234567')).toBeUndefined();
  });

  it('rejects one that is too short', () => {
    expect(validateVin('AB')).toBeDefined();
  });

  it('rejects one that is too long', () => {
    expect(validateVin('A'.repeat(33))).toBeDefined();
  });
});
