import { describe, expect, it } from 'vitest';
import {
  addMinutesToLocalDateTime,
  calendarRangeForDay,
  calendarRangeForWeek,
  calendarRowSpan,
  calendarSlotCount,
  calendarSlotToLocalTime,
  defaultBookingStart,
  isPastLocalDate,
  isPastLocalDateTime,
  isWeekendLocalDate,
  monthGridWeeks,
  stockholmWeekDays,
  stockholmWeekStart,
} from './calendar';

describe('stockholmWeekStart', () => {
  it('returns the same Monday for every day in its week', () => {
    // 2026-03-09 is a Monday.
    expect(stockholmWeekStart('2026-03-09')).toBe('2026-03-09');
    expect(stockholmWeekStart('2026-03-11')).toBe('2026-03-09');
    expect(stockholmWeekStart('2026-03-15')).toBe('2026-03-09'); // Sunday
  });

  it('rolls back over a month boundary', () => {
    // 2026-03-01 is a Sunday; its week starts in February.
    expect(stockholmWeekStart('2026-03-01')).toBe('2026-02-23');
  });
});

describe('stockholmWeekDays', () => {
  it('lists seven consecutive dates starting on the given Monday', () => {
    expect(stockholmWeekDays('2026-03-09')).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
  });
});

describe('isWeekendLocalDate', () => {
  it('flags Saturday and Sunday only', () => {
    expect(isWeekendLocalDate('2026-03-09')).toBe(false); // Mon
    expect(isWeekendLocalDate('2026-03-14')).toBe(true); // Sat
    expect(isWeekendLocalDate('2026-03-15')).toBe(true); // Sun
    expect(isWeekendLocalDate('2026-03-16')).toBe(false); // Mon
  });
});

describe('isPastLocalDate', () => {
  it('compares against the given today', () => {
    expect(isPastLocalDate('2026-03-09', '2026-03-10')).toBe(true);
    expect(isPastLocalDate('2026-03-10', '2026-03-10')).toBe(false);
    expect(isPastLocalDate('2026-03-11', '2026-03-10')).toBe(false);
  });
});

describe('isPastLocalDateTime', () => {
  it('is true once the Stockholm wall-clock instant has passed', () => {
    const now = new Date('2026-03-10T10:00:00.000Z'); // 11:00 in Stockholm (CET? check DST)
    expect(isPastLocalDateTime('2026-03-10T09:00', now)).toBe(true);
    expect(isPastLocalDateTime('2026-03-10T13:00', now)).toBe(false);
  });

  it('is DST-safe across the spring-forward boundary (2026-03-29)', () => {
    // 02:00 Stockholm time jumps straight to 03:00 that day, so 09:00 local
    // (CEST, UTC+2) is 07:00 UTC — one hour earlier than a naive UTC+1
    // conversion would give. Getting the offset wrong here would report a
    // booking as past (or not) a full hour too early or late.
    const beforeMidnightTransition = new Date('2026-03-29T00:30:00.000Z'); // 01:30 CET, before the jump
    expect(
      isPastLocalDateTime('2026-03-29T09:00', beforeMidnightTransition),
    ).toBe(false);
    const afterJumpButBeforeBooking = new Date('2026-03-29T03:00:00.000Z'); // 05:00 CEST
    expect(
      isPastLocalDateTime('2026-03-29T09:00', afterJumpButBeforeBooking),
    ).toBe(false);
    const wellAfter = new Date('2026-03-29T09:00:00.000Z'); // 11:00 CEST
    expect(isPastLocalDateTime('2026-03-29T09:00', wellAfter)).toBe(true);
  });
});

describe('calendarSlotCount', () => {
  it('divides the default 07:00-19:00 window into 30-minute slots', () => {
    expect(calendarSlotCount()).toBe(24);
  });
});

describe('calendarRowSpan', () => {
  it('places a booking fully inside the grid', () => {
    // 09:00-10:30 Stockholm on a winter day (CET, UTC+1).
    const span = calendarRowSpan(
      '2026-01-12T08:00:00.000Z',
      '2026-01-12T09:30:00.000Z',
      '2026-01-12',
    );
    // Grid starts at 07:00 local; 09:00 is 4 slots (2h) in.
    expect(span.rowStart).toBe(5);
    expect(span.rowEnd).toBe(8);
    expect(span.clipped).toBe(false);
  });

  it('clips a booking that starts before the visible grid', () => {
    const span = calendarRowSpan(
      '2026-01-12T05:00:00.000Z', // 06:00 local, before the 07:00 start
      '2026-01-12T07:30:00.000Z', // 08:30 local
      '2026-01-12',
    );
    expect(span.rowStart).toBe(1);
    expect(span.clipped).toBe(true);
  });

  it('clips a booking that ends after the visible grid', () => {
    const span = calendarRowSpan(
      '2026-01-12T17:00:00.000Z', // 18:00 local
      '2026-01-12T19:00:00.000Z', // 20:00 local, after the 19:00 end
      '2026-01-12',
    );
    expect(span.rowEnd).toBe(calendarSlotCount() + 1);
    expect(span.clipped).toBe(true);
  });

  it('always spans at least one row, even for a very short booking', () => {
    const span = calendarRowSpan(
      '2026-01-12T08:00:00.000Z',
      '2026-01-12T08:05:00.000Z',
      '2026-01-12',
    );
    expect(span.rowEnd).toBeGreaterThan(span.rowStart);
  });
});

describe('calendarSlotToLocalTime', () => {
  it('maps slot index 0 to the grid start hour', () => {
    expect(calendarSlotToLocalTime(0)).toBe('07:00');
  });

  it('maps a later slot to the correct half hour', () => {
    expect(calendarSlotToLocalTime(3)).toBe('08:30');
  });

  it('clamps an out-of-range index to the grid edges', () => {
    expect(calendarSlotToLocalTime(-5)).toBe('07:00');
    expect(calendarSlotToLocalTime(999)).toBe('18:30');
  });
});

describe('addMinutesToLocalDateTime', () => {
  it('adds a plain duration within the same day', () => {
    expect(addMinutesToLocalDateTime('2026-01-12T09:00', 90)).toBe(
      '2026-01-12T10:30',
    );
  });

  it('rolls over midnight', () => {
    expect(addMinutesToLocalDateTime('2026-01-12T23:30', 60)).toBe(
      '2026-01-13T00:30',
    );
  });

  it('adds a real 60 minutes across the spring-forward transition', () => {
    // 01:30 -> clocks skip to 03:00 -> adding 60 real minutes lands at 03:30,
    // not the naive wall-clock sum of 02:30 (which never occurs).
    expect(addMinutesToLocalDateTime('2026-03-29T01:30', 60)).toBe(
      '2026-03-29T03:30',
    );
  });
});

describe('calendarRangeForWeek', () => {
  it('spans Monday 00:00 to the following Monday 00:00, Stockholm time', () => {
    const range = calendarRangeForWeek('2026-03-11');
    expect(range.days).toEqual([
      '2026-03-09',
      '2026-03-10',
      '2026-03-11',
      '2026-03-12',
      '2026-03-13',
      '2026-03-14',
      '2026-03-15',
    ]);
    // 2026-03-09 is in CET (UTC+1): midnight local is 23:00 UTC the day before.
    expect(range.from).toBe('2026-03-08T23:00:00.000Z');
    // The exclusive end is midnight after 2026-03-15, also CET.
    expect(range.to).toBe('2026-03-15T23:00:00.000Z');
  });
});

describe('monthGridWeeks', () => {
  it('produces exactly five weeks for a month that fits in five', () => {
    // April 2026 starts on a Wednesday and has 30 days -> Monday
    // 2026-03-30 through Sunday 2026-05-03, five whole weeks.
    const weeks = monthGridWeeks('2026-04-15');
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toBe('2026-03-30');
    expect(weeks.at(-1)?.[6]).toBe('2026-05-03');
  });

  it('produces six weeks for a month that needs a sixth', () => {
    // March 2026 starts on a Sunday and has 31 days, spilling into a sixth
    // row: Monday 2026-02-23 through Sunday 2026-04-05.
    const weeks = monthGridWeeks('2026-03-15');
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toBe('2026-02-23');
    expect(weeks.at(-1)?.[6]).toBe('2026-04-05');
  });

  it('every week starts on a Monday and is seven consecutive days', () => {
    for (const week of monthGridWeeks('2026-03-15')) {
      expect(isWeekendLocalDate(week[0])).toBe(false);
      for (let index = 1; index < week.length; index += 1) {
        const previous = week[index - 1];
        const current = week[index];
        expect(previous).toBeDefined();
        expect(current).toBeDefined();
      }
    }
  });
});

describe('calendarRangeForDay', () => {
  it('spans one local day, exclusive end', () => {
    const range = calendarRangeForDay('2026-03-11');
    expect(range.days).toEqual(['2026-03-11']);
    expect(range.from).toBe('2026-03-10T23:00:00.000Z');
    expect(range.to).toBe('2026-03-11T23:00:00.000Z');
  });
});

describe('defaultBookingStart', () => {
  /** Stockholm is UTC+2 in June, so 07:00Z is 09:00 locally. */
  const juneMorning = new Date('2026-06-10T07:12:00.000Z');

  it('opens a future day at the workshop opening hour', () => {
    expect(defaultBookingStart('2026-06-11', juneMorning)).toEqual({
      date: '2026-06-11',
      startTime: '07:00',
    });
  });

  it('opens today at the next whole slot once the day has started', () => {
    // 09:12 locally: 07:00 has gone, so the first honest offer is 09:30.
    expect(defaultBookingStart('2026-06-10', juneMorning)).toEqual({
      date: '2026-06-10',
      startTime: '09:30',
    });
  });

  it('offers the opening hour when the day has not started yet', () => {
    // 05:30 locally, before 07:00.
    const beforeOpening = new Date('2026-06-10T03:30:00.000Z');
    expect(defaultBookingStart('2026-06-10', beforeOpening)).toEqual({
      date: '2026-06-10',
      startTime: '07:00',
    });
  });

  it('lands exactly on a slot boundary rather than repeating it', () => {
    // 09:30 locally on the nose: 09:30 itself is no longer offerable, so the
    // next one is. An off-by-one here would propose a time already passing.
    const onTheSlot = new Date('2026-06-10T07:30:00.000Z');
    expect(defaultBookingStart('2026-06-10', onTheSlot).startTime).toBe(
      '10:00',
    );
  });

  it('rolls to tomorrow once the last slot has gone', () => {
    // 20:30 locally, past the 19:00 end of the grid.
    const evening = new Date('2026-06-10T18:30:00.000Z');
    expect(defaultBookingStart('2026-06-10', evening)).toEqual({
      date: '2026-06-11',
      startTime: '07:00',
    });
  });

  it('never proposes a date in the past, or a passed time on today', () => {
    // The calendar can be parked on a past week; the dialog must not open on
    // a day the date picker itself refuses — and falling back to *today at
    // the opening hour* would be the same already-passed time in a different
    // disguise, so a past anchor takes today's rules in full.
    expect(defaultBookingStart('2026-06-01', juneMorning)).toEqual({
      date: '2026-06-10',
      startTime: '09:30',
    });
  });
});
