import { describe, expect, it } from 'vitest';
import { formatRegNr } from './reg-nr';

describe('formatRegNr', () => {
  it('produces the spaced display form', () => {
    expect(formatRegNr('abc123')).toBe('ABC 123');
    expect(formatRegNr('ABC-12D')).toBe('ABC 12D');
  });
});
