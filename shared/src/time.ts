import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

/**
 * The workshop's single timezone. A constant, not an env var — containers
 * run in UTC deliberately (PROJECT_SPEC.md §3.6, §2.1) and every conversion
 * to local wall-clock time goes through this value via `date-fns-tz`.
 */
export const WORKSHOP_TIMEZONE = 'Europe/Stockholm';

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * True when `from` and `to` are both parseable instants, `to` is not before
 * `from`, and they are at most `maxDays` apart.
 *
 * Used to cap the calendar window (§6.2, B5.5.1). Deliberately measured in
 * elapsed milliseconds rather than calendar days: this bounds how much work a
 * query can ask for, and a DST transition changing a day's length must not
 * change the answer to that question.
 */
export function isWithinDayRange(
  from: string,
  to: string,
  maxDays: number,
): boolean {
  const start = Date.parse(from);
  const end = Date.parse(to);

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }

  const elapsed = end - start;
  return elapsed >= 0 && elapsed <= maxDays * MILLISECONDS_PER_DAY;
}

/**
 * True when both boundaries parse and `endsAt` is strictly after `startsAt`.
 *
 * A booking of zero length is not a booking, and the exclusion constraint
 * cannot catch one: an empty range overlaps nothing, so two of them in the
 * same slot are both accepted (§6.2, B5.4).
 */
export function isPositiveInterval(startsAt: string, endsAt: string): boolean {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);

  return !Number.isNaN(start) && !Number.isNaN(end) && end > start;
}

/**
 * Local wall-clock ↔ UTC instant (§3.6, B5.5.3).
 *
 * Everything on the wire and in the database is a UTC instant. A calendar,
 * however, is a local thing: "tisdag den 29 mars" is a 23-hour day in Sweden
 * and a booking at 09:00 is at 09:00 on both sides of a transition. These four
 * functions are the **only** place that conversion happens, for the same
 * reason `shared/units.ts` owns km ↔ mil: two implementations of a conversion
 * eventually disagree, and this one disagrees twice a year.
 *
 * Both the backend and the browser import them, so a week the calendar asks
 * for and the window the API answers with are derived from one piece of code.
 */

/** `2026-03-29` — a calendar date with no time and no zone. */
const LOCAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** `2026-03-29T09:00` or `...T09:00:00` — wall-clock, deliberately zoneless. */
const LOCAL_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/**
 * Splits a local date into its parts, rejecting a well-formed string that is
 * not a real date.
 *
 * The round-trip through `Date.UTC` is the check that matters: `2026-02-30`
 * matches the pattern, and both `new Date(...)` and `Date.UTC` **roll it over**
 * to 2 March rather than reporting an error. Left unchecked, a calendar query
 * would quietly answer for a day nobody asked about.
 */
function parseLocalDate(value: string): {
  year: number;
  month: number;
  day: number;
} {
  if (!LOCAL_DATE.test(value)) {
    throw new RangeError(`Expected a YYYY-MM-DD local date, got "${value}"`);
  }

  const parts = {
    year: Number(value.slice(0, 4)),
    month: Number(value.slice(5, 7)),
    day: Number(value.slice(8, 10)),
  };

  const utc = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (utc.toISOString().slice(0, 10) !== value) {
    throw new RangeError(`"${value}" is not a real calendar date`);
  }

  return parts;
}

/** The Stockholm calendar date an instant falls on — `2026-03-29`. */
export function stockholmDate(instant: Date): string {
  return formatInTimeZone(instant, WORKSHOP_TIMEZONE, 'yyyy-MM-dd');
}

/** The Stockholm wall-clock an instant reads as — `2026-03-29T09:00`. */
export function stockholmWallClock(instant: Date): string {
  return formatInTimeZone(instant, WORKSHOP_TIMEZONE, "yyyy-MM-dd'T'HH:mm");
}

/**
 * The instant a Stockholm wall-clock time refers to. `2026-03-29T09:00` is
 * 07:00 UTC, while the same clock time a day earlier is 08:00 UTC — which is
 * the whole reason opening hours and bookings are never stored as an offset.
 */
export function stockholmWallClockToUtc(localDateTime: string): Date {
  if (!LOCAL_DATE_TIME.test(localDateTime)) {
    throw new RangeError(
      `Expected a YYYY-MM-DDTHH:mm local time, got "${localDateTime}"`,
    );
  }

  // The pattern fixes the layout, so the date is the first ten characters —
  // read by position rather than out of a capture group, which would be
  // `string | undefined` and tempt an assertion CLAUDE.md bans.
  parseLocalDate(localDateTime.slice(0, 10));

  return fromZonedTime(localDateTime, WORKSHOP_TIMEZONE);
}

/** Midnight in Stockholm at the start of a local calendar date. */
export function stockholmDayStart(localDate: string): Date {
  parseLocalDate(localDate);
  return fromZonedTime(`${localDate}T00:00:00.000`, WORKSHOP_TIMEZONE);
}

/**
 * The **exclusive** end of a local calendar day: midnight at the start of the
 * next one. Derived by advancing the calendar date rather than by adding 24
 * hours, because 29 March is 23 hours long and 25 October is 25 — adding a
 * fixed duration loses an hour of bookings twice a year.
 */
export function stockholmDayEnd(localDate: string): Date {
  const { year, month, day } = parseLocalDate(localDate);

  // Calendar arithmetic in UTC, where every day is exactly 24 hours, so the
  // month and year roll over correctly and no DST rule is involved yet.
  const nextDate = new Date(Date.UTC(year, month - 1, day + 1))
    .toISOString()
    .slice(0, 10);

  return stockholmDayStart(nextDate);
}
