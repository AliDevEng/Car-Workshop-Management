import { describe, expect, it } from 'vitest';
import { formatOdometer } from './odometer';

// Intl.NumberFormat('sv-SE') groups thousands with U+00A0 (no-break space).
const NBSP = ' ';

describe('formatOdometer', () => {
  it('formats a typical reading in mil', () => {
    expect(formatOdometer(125)).toBe('12,5 mil');
  });

  it('formats zero', () => {
    expect(formatOdometer(0)).toBe('0,0 mil');
  });

  it('formats a large reading with Swedish thousands grouping', () => {
    expect(formatOdometer(999_999)).toBe(`99${NBSP}999,9 mil`);
  });
});
