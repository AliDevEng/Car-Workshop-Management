import { describe, expect, it } from 'vitest';
import {
  formatRegNrForDisplay,
  formatRegNrSpaced,
  isNonStandardPlate,
  isNormalisedRegNr,
  isValidSwedishRegNr,
  normaliseRegNr,
} from '../src/regnr.js';

describe('normaliseRegNr', () => {
  it('uppercases and strips spaces and dashes', () => {
    expect(normaliseRegNr('abc 12d')).toBe('ABC12D');
    expect(normaliseRegNr('ABC-123')).toBe('ABC123');
  });

  it('leaves an empty string empty', () => {
    expect(normaliseRegNr('')).toBe('');
  });
});

describe('isValidSwedishRegNr', () => {
  it('accepts standard plates, letter- or digit-ended', () => {
    expect(isValidSwedishRegNr('abc 12d')).toBe(true);
    expect(isValidSwedishRegNr('ABC-123')).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(isValidSwedishRegNr('')).toBe(false);
  });

  it('rejects a plate that is too long', () => {
    expect(isValidSwedishRegNr('ABC1234567')).toBe(false);
  });

  it('rejects characters outside the standard set', () => {
    expect(isValidSwedishRegNr('ÅÄÖ 123')).toBe(false);
  });
});

describe('isNonStandardPlate', () => {
  it('flags non-standard characters rather than rejecting outright', () => {
    expect(isNonStandardPlate('ÅÄÖ 123')).toBe(true);
  });

  it('flags an over-length plate', () => {
    expect(isNonStandardPlate('ABC1234567')).toBe(true);
  });

  it('does not flag a valid standard plate', () => {
    expect(isNonStandardPlate('ABC123')).toBe(false);
  });

  it('does not flag an empty string as non-standard (simply absent)', () => {
    expect(isNonStandardPlate('')).toBe(false);
  });
});

describe('formatRegNrSpaced / formatRegNrForDisplay', () => {
  it('inserts the physical-plate space', () => {
    expect(formatRegNrSpaced('abc 12d')).toBe('ABC 12D');
    expect(formatRegNrForDisplay('ABC-123')).toBe('ABC 123');
  });

  it('inserts a space for a 6-character plate regardless of character validity', () => {
    // Length, not character validity, decides whether to split — a plate
    // with non-standard characters is still spaced the same physical way.
    expect(formatRegNrSpaced('ÅÄÖ 123')).toBe('ÅÄÖ 123');
  });

  it('falls back to the unspaced form for a non-standard length', () => {
    expect(formatRegNrSpaced('AB12')).toBe('AB12');
  });
});

describe('isNormalisedRegNr', () => {
  it('accepts the canonical stored form', () => {
    expect(isNormalisedRegNr('ABC12D')).toBe(true);
    expect(isNormalisedRegNr('ABC123')).toBe(true);
    // Non-standard plates are stored too, flagged rather than rejected (§4.2).
    expect(isNormalisedRegNr('ÅÄÖ123')).toBe(true);
  });

  it('rejects a spelling normalisation would still change', () => {
    expect(isNormalisedRegNr('abc12d')).toBe(false);
    expect(isNormalisedRegNr('ABC 12D')).toBe(false);
    expect(isNormalisedRegNr('ABC-12D')).toBe(false);
  });

  it('rejects characters no plate carries', () => {
    // The reason the check is not merely `value === normaliseRegNr(value)`:
    // an underscore is neither lower case nor a separator that normalisation
    // strips, so that check alone lets arbitrary text into the column the
    // unique index is built on.
    expect(isNormalisedRegNr('ABC_12D')).toBe(false);
    expect(isNormalisedRegNr('AB!')).toBe(false);
  });

  it('rejects lengths no plate has', () => {
    expect(isNormalisedRegNr('')).toBe(false);
    expect(isNormalisedRegNr('A')).toBe(false);
    expect(isNormalisedRegNr('ABCDEFGHIJK')).toBe(false);
  });
});
