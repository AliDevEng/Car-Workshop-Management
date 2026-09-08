import { describe, expect, it } from 'vitest';
import { WORKSHOP_TIMEZONE, isWithinDayRange } from '../src/time.js';

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

describe('isWithinDayRange', () => {
  const from = '2026-03-01T00:00:00Z';

  it('accepts a range inside the cap, including the exact boundary', () => {
    expect(isWithinDayRange(from, '2026-03-01T00:00:00Z', 90)).toBe(true);
    expect(isWithinDayRange(from, '2026-05-30T00:00:00Z', 90)).toBe(true);
  });

  it('rejects a range past the cap', () => {
    expect(isWithinDayRange(from, '2026-05-30T00:00:01Z', 90)).toBe(false);
  });

  it('rejects a range that runs backwards', () => {
    expect(isWithinDayRange('2026-05-30T00:00:00Z', from, 90)).toBe(false);
  });

  it('rejects an unparseable boundary rather than treating it as now', () => {
    expect(isWithinDayRange('not-a-date', from, 90)).toBe(false);
    expect(isWithinDayRange(from, 'not-a-date', 90)).toBe(false);
  });

  it('measures elapsed time, so a DST transition does not shift the cap', () => {
    // The 90-day window across the March transition is 90 × 24 h of elapsed
    // time, not 90 calendar days — one of which is 23 hours long.
    expect(
      isWithinDayRange('2026-03-01T00:00:00Z', '2026-05-30T00:00:00Z', 90),
    ).toBe(true);
  });
});
