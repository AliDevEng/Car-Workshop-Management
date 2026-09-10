import { describe, expect, it } from 'vitest';
import {
  WORKSHOP_TIMEZONE,
  addStockholmDays,
  isPositiveInterval,
  isWithinDayRange,
  stockholmDate,
  stockholmDayEnd,
  stockholmDayStart,
  stockholmWallClock,
  stockholmWallClockToUtc,
} from '../src/time.js';

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

describe('isPositiveInterval', () => {
  it('accepts an interval that moves forward', () => {
    expect(
      isPositiveInterval('2026-03-29T07:00:00Z', '2026-03-29T08:00:00Z'),
    ).toBe(true);
  });

  it('rejects a zero-length interval', () => {
    // The exclusion constraint cannot catch this one: an empty range overlaps
    // nothing, so two zero-length bookings in the same slot are both accepted.
    expect(
      isPositiveInterval('2026-03-29T07:00:00Z', '2026-03-29T07:00:00Z'),
    ).toBe(false);
  });

  it('rejects an interval that runs backwards', () => {
    expect(
      isPositiveInterval('2026-03-29T08:00:00Z', '2026-03-29T07:00:00Z'),
    ).toBe(false);
  });

  it('rejects an unparseable boundary rather than treating it as now', () => {
    expect(isPositiveInterval('not-a-date', '2026-03-29T08:00:00Z')).toBe(
      false,
    );
    expect(isPositiveInterval('2026-03-29T07:00:00Z', 'not-a-date')).toBe(
      false,
    );
  });
});

/**
 * The two Swedish transitions in 2026: clocks go forward on 29 March (a
 * 23-hour day) and back on 25 October (a 25-hour day). Every assertion below
 * is chosen so that an implementation adding a fixed 24 hours, or storing an
 * offset, fails it.
 */
describe('Europe/Stockholm wall-clock conversion (§3.6, B5.5.3)', () => {
  it('reads an instant as the local date and clock time', () => {
    expect(stockholmDate(new Date('2026-03-29T07:00:00Z'))).toBe('2026-03-29');
    expect(stockholmWallClock(new Date('2026-03-29T07:00:00Z'))).toBe(
      '2026-03-29T09:00',
    );
    // The same clock time the day before is one UTC hour earlier: 08:00Z.
    expect(stockholmWallClock(new Date('2026-03-28T08:00:00Z'))).toBe(
      '2026-03-28T09:00',
    );
  });

  it('converts a wall-clock time to the instant it means', () => {
    expect(stockholmWallClockToUtc('2026-03-28T09:00').toISOString()).toBe(
      '2026-03-28T08:00:00.000Z',
    );
    expect(stockholmWallClockToUtc('2026-03-29T09:00:00').toISOString()).toBe(
      '2026-03-29T07:00:00.000Z',
    );
    expect(stockholmWallClockToUtc('2026-10-25T09:00').toISOString()).toBe(
      '2026-10-25T08:00:00.000Z',
    );
  });

  it('round-trips a booking time across both transitions', () => {
    for (const wallClock of ['2026-03-29T09:00', '2026-10-25T09:00']) {
      expect(stockholmWallClock(stockholmWallClockToUtc(wallClock))).toBe(
        wallClock,
      );
    }
  });

  it('rejects a malformed or impossible wall-clock time', () => {
    expect(() => stockholmWallClockToUtc('2026-03-29 09:00')).toThrow(
      RangeError,
    );
    expect(() => stockholmWallClockToUtc('2026-03-29T25:00')).toThrow(
      RangeError,
    );
    expect(() => stockholmWallClockToUtc('2026-02-30T09:00')).toThrow(
      RangeError,
    );
  });

  it('bounds a local day by its own midnights, not by 24 hours', () => {
    const shortDay = {
      start: stockholmDayStart('2026-03-29'),
      end: stockholmDayEnd('2026-03-29'),
    };
    const longDay = {
      start: stockholmDayStart('2026-10-25'),
      end: stockholmDayEnd('2026-10-25'),
    };
    const hour = 60 * 60 * 1000;

    expect(shortDay.start.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(shortDay.end.toISOString()).toBe('2026-03-29T22:00:00.000Z');
    expect(shortDay.end.getTime() - shortDay.start.getTime()).toBe(23 * hour);
    expect(longDay.end.getTime() - longDay.start.getTime()).toBe(25 * hour);
  });

  it('advances the calendar date across a month and a year boundary', () => {
    expect(stockholmDayEnd('2026-01-31')).toEqual(
      stockholmDayStart('2026-02-01'),
    );
    expect(stockholmDayEnd('2026-12-31')).toEqual(
      stockholmDayStart('2027-01-01'),
    );
  });

  it('rejects a malformed or impossible calendar date', () => {
    expect(() => stockholmDayStart('29/03/2026')).toThrow(RangeError);
    expect(() => stockholmDayStart('2026-02-30')).toThrow(RangeError);
    expect(() => stockholmDayEnd('2026-13-01')).toThrow(RangeError);
  });
});

describe('addStockholmDays (B7.3.1)', () => {
  it('adds whole days to a calendar date', () => {
    expect(addStockholmDays('2026-09-10', 30)).toBe('2026-10-10');
    expect(addStockholmDays('2026-09-10', 0)).toBe('2026-09-10');
    expect(addStockholmDays('2026-09-10', -1)).toBe('2026-09-09');
  });

  it('rolls over a month, a year and a leap day', () => {
    expect(addStockholmDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addStockholmDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addStockholmDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('is unaffected by a DST transition inside the span', () => {
    // The result is a *date*. 29 March being 23 hours long does not change
    // which date is two days after 28 March, and an implementation that added
    // 48 hours of milliseconds would get this wrong.
    expect(addStockholmDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(addStockholmDays('2026-10-24', 2)).toBe('2026-10-26');
  });

  it('rejects a malformed date or a fractional number of days', () => {
    expect(() => addStockholmDays('2026-02-30', 1)).toThrow(RangeError);
    expect(() => addStockholmDays('2026-09-10', 1.5)).toThrow(RangeError);
  });
});
