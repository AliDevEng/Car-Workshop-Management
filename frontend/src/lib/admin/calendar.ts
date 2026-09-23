import {
  addStockholmDays,
  stockholmDate,
  stockholmDayEnd,
  stockholmDayStart,
  stockholmWallClock,
  stockholmWallClockToUtc,
} from 'shared';

/**
 * Pure calendar arithmetic for F8's week and day views (frontend/README.md
 * F8.3–F8.5). Kept free of React and of `fetch` so the DST edge cases and the
 * "no booking in the past" rule can be asserted directly, the way F1.3.8
 * tests each conversion input's parser rather than only the component that
 * renders it.
 */

// --- Weeks -------------------------------------------------------------------

/** A Monday-first week, always seven local dates. */
export type WeekDays = readonly [
  string,
  string,
  string,
  string,
  string,
  string,
  string,
];

/**
 * The Monday on or before `localDate`. `Date.UTC`'s weekday, not a
 * `date-fns` week helper: the value is a bare calendar date with no zone
 * (§3.6), and reading it as a local `Date` would shift the answer by an hour
 * around a DST boundary for anyone not in `Europe/Stockholm`.
 */
export function stockholmWeekStart(localDate: string): string {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay(); // 0=Sun..6=Sat
  const isoWeekday = weekday === 0 ? 7 : weekday; // 1=Mon..7=Sun
  return addStockholmDays(localDate, -(isoWeekday - 1));
}

/** The seven local dates of the week starting on `weekStart` (a Monday). */
export function stockholmWeekDays(weekStart: string): WeekDays {
  return [
    weekStart,
    addStockholmDays(weekStart, 1),
    addStockholmDays(weekStart, 2),
    addStockholmDays(weekStart, 3),
    addStockholmDays(weekStart, 4),
    addStockholmDays(weekStart, 5),
    addStockholmDays(weekStart, 6),
  ];
}

/** Saturday or Sunday — the two columns the custom calendar marks in red. */
export function isWeekendLocalDate(localDate: string): boolean {
  const weekday = new Date(`${localDate}T00:00:00.000Z`).getUTCDay();
  return weekday === 0 || weekday === 6;
}

/**
 * Every Monday-first week needed to show all of `monthAnchor`'s month
 * (`monthAnchor` may be any date within it — only its year and month are
 * read). Five or six weeks, whichever the month actually needs, so the
 * custom date picker never renders a blank trailing row.
 *
 * Parsed by position (`.slice()` then `Number()`), not by destructuring a
 * `.split('-')` result, matching `shared/time.ts`'s `parseLocalDate` — the
 * same avoidance of an indexed value TypeScript cannot prove is defined.
 */
export function monthGridWeeks(monthAnchor: string): readonly WeekDays[] {
  const yearMonth = monthAnchor.slice(0, 7);
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstOfMonth = `${yearMonth}-01`;
  const lastOfMonth = `${yearMonth}-${pad2(daysInMonth)}`;
  const lastWeekStart = stockholmWeekStart(lastOfMonth);

  const weeks: WeekDays[] = [];
  let cursor = stockholmWeekStart(firstOfMonth);
  // Bounded by `lastWeekStart`, reached in at most six iterations for any
  // real month — a condition, not a hard-coded count, so a five-week month
  // does not grow a blank trailing row.
  for (;;) {
    weeks.push(stockholmWeekDays(cursor));
    if (cursor === lastWeekStart) {
      break;
    }
    cursor = addStockholmDays(cursor, 7);
  }
  return weeks;
}

// --- Past protection -----------------------------------------------------

/**
 * True once `localDate` is strictly before today in Stockholm. ISO calendar
 * dates compare correctly as plain strings, so this needs no `Date` at all.
 */
export function isPastLocalDate(
  localDate: string,
  today: string = stockholmDate(new Date()),
): boolean {
  return localDate < today;
}

/**
 * True once a Stockholm wall-clock instant (`2026-03-29T09:00`) has already
 * passed. This is the one rule that makes "no booking in the past" real: a
 * date-only check would still let someone book 08:00 today at 14:00 today.
 */
export function isPastLocalDateTime(
  localDateTime: string,
  now: Date = new Date(),
): boolean {
  return stockholmWallClockToUtc(localDateTime).getTime() < now.getTime();
}

// --- The week/day grid -----------------------------------------------------

export interface CalendarGridBounds {
  /** Inclusive, e.g. `7` for 07:00. */
  readonly startHour: number;
  /** Exclusive, e.g. `19` for 19:00. */
  readonly endHour: number;
  readonly slotMinutes: number;
}

/**
 * 07:00–19:00 in 30-minute slots. A fixed window rather than one read from
 * `Setting.openingHours` (§4.2): the grid only needs to be wide enough to
 * show every realistic booking, and widening it here can never hide a
 * booking — {@link calendarRowSpan} clips into the visible edge rather than
 * dropping anything that falls outside it.
 */
export const DEFAULT_CALENDAR_GRID_BOUNDS: CalendarGridBounds = {
  startHour: 7,
  endHour: 19,
  slotMinutes: 30,
};

export function calendarSlotCount(
  bounds: CalendarGridBounds = DEFAULT_CALENDAR_GRID_BOUNDS,
): number {
  return ((bounds.endHour - bounds.startHour) * 60) / bounds.slotMinutes;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/** `"07:00"` for hour `7` — the row labels down the side of the grid. */
export function calendarHourLabel(hour: number): string {
  return `${pad2(hour)}:00`;
}

function gridBoundsInstants(
  localDate: string,
  bounds: CalendarGridBounds,
): { readonly start: Date; readonly end: Date } {
  return {
    start: stockholmWallClockToUtc(`${localDate}T${pad2(bounds.startHour)}:00`),
    end: stockholmWallClockToUtc(`${localDate}T${pad2(bounds.endHour)}:00`),
  };
}

export interface CalendarRowSpan {
  /** 1-based CSS `grid-row-start`. */
  readonly rowStart: number;
  /** 1-based, exclusive CSS `grid-row-end`. */
  readonly rowEnd: number;
  /** True when the real interval reaches outside the visible grid. */
  readonly clipped: boolean;
}

/**
 * Where a booking lands in one day's grid, as CSS grid row lines, clamped to
 * `bounds`. Computed from absolute instants rather than wall-clock arithmetic
 * on the two ends, so a booking that happens to straddle a DST transition
 * still measures its real duration.
 *
 * A booking outside the visible hours is clipped to the nearest edge rather
 * than hidden — a 06:30 start must still show as *something*, or an early
 * job silently disappears from the calendar it is on.
 */
export function calendarRowSpan(
  startsAt: string,
  endsAt: string,
  localDate: string,
  bounds: CalendarGridBounds = DEFAULT_CALENDAR_GRID_BOUNDS,
): CalendarRowSpan {
  const { start: gridStart, end: gridEnd } = gridBoundsInstants(
    localDate,
    bounds,
  );
  const start = new Date(startsAt).getTime();
  const end = new Date(endsAt).getTime();
  const gridStartMs = gridStart.getTime();
  const gridEndMs = gridEnd.getTime();
  const totalSlots = calendarSlotCount(bounds);

  const clipped = start < gridStartMs || end > gridEndMs;

  const clampedStartMinutes =
    (Math.min(Math.max(start, gridStartMs), gridEndMs) - gridStartMs) / 60_000;
  const clampedEndMinutes =
    (Math.min(Math.max(end, gridStartMs), gridEndMs) - gridStartMs) / 60_000;

  const rowStart = 1 + Math.floor(clampedStartMinutes / bounds.slotMinutes);
  const rowEnd = Math.min(
    totalSlots + 1,
    Math.max(
      rowStart + 1,
      1 + Math.ceil(clampedEndMinutes / bounds.slotMinutes),
    ),
  );

  return { rowStart, rowEnd, clipped };
}

/** The slot a mouse/touch position (0-based row index) refers to, clamped. */
export function calendarSlotToLocalTime(
  slotIndex: number,
  bounds: CalendarGridBounds = DEFAULT_CALENDAR_GRID_BOUNDS,
): string {
  const clamped = Math.min(Math.max(slotIndex, 0), calendarSlotCount(bounds) - 1);
  const minutesFromStart = clamped * bounds.slotMinutes;
  const hour = bounds.startHour + Math.floor(minutesFromStart / 60);
  const minute = minutesFromStart % 60;
  return `${pad2(hour)}:${pad2(minute)}`;
}

// --- Duration and time arithmetic -------------------------------------------

/** The durations offered in the confirmation dialog (F8.2.2). */
export const BOOKING_DURATION_OPTIONS_MINUTES = [
  30, 60, 90, 120, 180, 240,
] as const;
export type BookingDurationMinutes =
  (typeof BOOKING_DURATION_OPTIONS_MINUTES)[number];

export function formatDurationMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) {
    return `${String(rest)} min`;
  }
  if (rest === 0) {
    return `${String(hours)} tim`;
  }
  return `${String(hours)} tim ${String(rest)} min`;
}

/**
 * `localDateTime` shifted by `minutes`, still a Stockholm wall-clock string.
 * Goes through the real UTC instant rather than adding minutes to the string
 * directly, so a duration that crosses a DST transition still lands on the
 * clock time a customer would expect.
 */
export function addMinutesToLocalDateTime(
  localDateTime: string,
  minutes: number,
): string {
  const instant = stockholmWallClockToUtc(localDateTime);
  return stockholmWallClock(new Date(instant.getTime() + minutes * 60_000));
}

/**
 * Where a new booking's form should start: the first slot on `anchorDate`
 * that has not already gone.
 *
 * Opening the telephone-booking dialog at a flat 08:00 meant that from 08:01
 * onwards it rendered "Den valda tiden har redan passerat" in red before the
 * staff member had typed anything, with the submit button disabled — the form
 * accusing its user of a mistake they had not made yet, on every call taken
 * after breakfast.
 *
 * The rules, in order:
 *   - a future day starts at the workshop's opening hour;
 *   - today starts at the next whole slot after now, so a call at 09:12 offers
 *     09:30;
 *   - a day already past its last slot rolls to tomorrow morning, because
 *     there is no honest time left to offer on it.
 *
 * `now` is injectable so the rollover can be asserted at a fixed instant
 * rather than at whatever time the suite happens to run.
 */
export function defaultBookingStart(
  anchorDate: string,
  now: Date = new Date(),
  bounds: CalendarGridBounds = DEFAULT_CALENDAR_GRID_BOUNDS,
): { readonly date: string; readonly startTime: string } {
  const openingTime = calendarHourLabel(bounds.startHour);
  const today = stockholmDate(now);

  // A past day cannot hold a new booking at all — the date picker refuses it
  // too — so fall through to today's rules rather than returning this day at
  // the opening hour, which would be the same already-passed time in a
  // different disguise.
  const day = isPastLocalDate(anchorDate, today) ? today : anchorDate;

  if (day !== today) {
    return { date: day, startTime: openingTime };
  }

  const nowLocal = stockholmWallClock(now);
  if (!isPastLocalDateTime(`${day}T${openingTime}`, now)) {
    return { date: day, startTime: openingTime };
  }

  // `stockholmWallClock` gives `YYYY-MM-DDTHH:MM`; the clock part is the last
  // five characters, read by position for the same reason the rest of this
  // module parses dates that way.
  const minutesNow =
    Number(nowLocal.slice(11, 13)) * 60 + Number(nowLocal.slice(14, 16));
  const nextSlot =
    Math.ceil((minutesNow - bounds.startHour * 60 + 1) / bounds.slotMinutes) *
    bounds.slotMinutes;

  if (nextSlot >= (bounds.endHour - bounds.startHour) * 60) {
    return { date: addStockholmDays(day, 1), startTime: openingTime };
  }

  return {
    date: day,
    startTime: calendarSlotToLocalTime(nextSlot / bounds.slotMinutes, bounds),
  };
}

/** The `{ from, to }` window `GET /api/bookings` needs for one view. */
export interface CalendarRange {
  readonly from: string;
  readonly to: string;
  readonly days: WeekDays | readonly [string];
}

export function calendarRangeForWeek(anchorDate: string): CalendarRange {
  const weekStart = stockholmWeekStart(anchorDate);
  const days = stockholmWeekDays(weekStart);
  const lastDay = days[6];
  return {
    from: stockholmDayStart(weekStart).toISOString(),
    to: stockholmDayEnd(lastDay).toISOString(),
    days,
  };
}

export function calendarRangeForDay(anchorDate: string): CalendarRange {
  return {
    from: stockholmDayStart(anchorDate).toISOString(),
    to: stockholmDayEnd(anchorDate).toISOString(),
    days: [anchorDate],
  };
}
