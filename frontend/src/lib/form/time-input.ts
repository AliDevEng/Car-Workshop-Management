/**
 * The arithmetic behind `components/form/time-picker.tsx` (the twin of
 * `lib/admin/calendar.ts` behind the month calendar).
 *
 * A wall-clock time of day, 24-hour, `HH:MM` — the same shape
 * `shared/time.ts` appends to a local date, and the same shape
 * `calendarSlotToLocalTime` produces. Kept free of React so the rounding and
 * the off-grid-minute rule can be asserted directly rather than through a
 * popover.
 */

export interface TimeOfDay {
  readonly hour: number;
  readonly minute: number;
}

/** 24-hour `HH:MM`. Nothing else is a time in this application. */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Five minutes is already finer than the half-hourly calendar grid. */
export const MINUTE_STEP = 5;

export const HOUR_OPTIONS: readonly number[] = Array.from(
  { length: 24 },
  (_, hour) => hour,
);

const MINUTE_STEPS: readonly number[] = Array.from(
  { length: 60 / MINUTE_STEP },
  (_, index) => index * MINUTE_STEP,
);

export function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Parsed by position after the pattern has vouched for the shape, the way
 * `lib/admin/calendar.ts` reads a date — not by indexing a regex group, which
 * TypeScript cannot prove is defined.
 */
export function parseTimeOfDay(value: string): TimeOfDay | null {
  if (!TIME_PATTERN.test(value)) {
    return null;
  }
  return { hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) };
}

export function formatTimeOfDay(time: TimeOfDay): string {
  return `${pad2(time.hour)}:${pad2(time.minute)}`;
}

/**
 * The minutes the picker offers.
 *
 * A stored minute that is not on the step grid — a booking written before
 * this picker existed, when the field was a native `<input type="time">` with
 * one-minute resolution — is added to the list rather than rounded away.
 * Opening a 09:07 booking to change its mechanic must not silently move it to
 * 09:05, and a value the picker cannot show is a value it would erase on the
 * next selection.
 */
export function minuteOptions(selected: number | null): readonly number[] {
  if (selected === null || selected % MINUTE_STEP === 0) {
    return MINUTE_STEPS;
  }
  return [...MINUTE_STEPS, selected].sort((a, b) => a - b);
}
