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
