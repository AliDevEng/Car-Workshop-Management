/**
 * The two daily call ceilings (PROJECT_SPEC.md §6.1, §7.1, B10.3.1).
 *
 * A rolling 24-hour window per key, matching `createBookingRequestLimiters`'
 * "20 per day globally" rather than a calendar-day reset — this codebase's one
 * existing "daily" limit already means a 24-hour window from first use, and a
 * second convention for the word would be a trap for whoever reads this next.
 *
 * Unlike `AttemptLimiter`, the ceiling itself is **not** fixed at creation: it
 * is an `ADMIN`-editable `Setting` (`workshopOperationalSettingsSchema`), read
 * fresh on every call, so raising it in the settings screen takes effect on
 * the very next lookup rather than needing a restart.
 */

export type DailyCounter = {
  /**
   * Records one call against `key` and reports whether it was **within**
   * `max` — the same semantics as `AttemptLimiter.consume`: always increments,
   * and the 201st call against a limit of 200 returns `false`.
   */
  readonly consume: (key: string, max: number) => boolean;
};

type Window = {
  count: number;
  expiresAt: number;
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function createDailyCounter(now: () => number = Date.now): DailyCounter {
  const windows = new Map<string, Window>();

  return {
    consume: (key, max) => {
      const at = now();
      const existing = windows.get(key);
      const window =
        existing !== undefined && existing.expiresAt > at
          ? existing
          : { count: 0, expiresAt: at + WINDOW_MS };

      window.count += 1;
      windows.set(key, window);

      return window.count <= max;
    },
  };
}
