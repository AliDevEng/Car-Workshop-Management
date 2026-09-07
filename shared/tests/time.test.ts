import { describe, expect, it } from 'vitest';
import { WORKSHOP_TIMEZONE } from '../src/time.js';

describe('WORKSHOP_TIMEZONE', () => {
  it('is an identifier the platform actually recognises', () => {
    // A typo here would not throw anywhere useful — it would quietly shift
    // every opening hour and booking boundary by an hour or two.
    expect(() =>
      new Intl.DateTimeFormat('sv-SE', { timeZone: WORKSHOP_TIMEZONE }).format(
        new Date(),
      ),
    ).not.toThrow();
  });

  it('observes DST, which is the whole reason §3.6 exists', () => {
    const format = (iso: string): string =>
      new Intl.DateTimeFormat('sv-SE', {
        timeZone: WORKSHOP_TIMEZONE,
        hour: '2-digit',
        hour12: false,
      }).format(new Date(iso));

    // 12:00 UTC is 13:00 in winter (CET) and 14:00 in summer (CEST). Storing
    // opening hours as a UTC offset would make the workshop appear to open an
    // hour early for half the year.
    expect(format('2026-01-15T12:00:00Z')).toBe('13');
    expect(format('2026-07-15T12:00:00Z')).toBe('14');
  });
});
