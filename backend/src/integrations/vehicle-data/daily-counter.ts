import { z } from 'zod';
import type { Database } from '../../lib/prisma.js';

/**
 * The two daily call ceilings (PROJECT_SPEC.md §6.1, §7.1, B10.3.1, H1.13).
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
 *
 * **The count lives in the database, not in process memory (H1.13).** Every
 * other in-process limiter in this codebase guards against abuse, where a
 * restart forgiving a few attempts costs nothing. This one is denominated in
 * real money: an in-memory count would let every restart, redeploy or crash
 * refill a budget the workshop has already spent.
 */

export type DailyCounterKey = 'staff' | 'public';

export type DailyCounter = {
  /**
   * Records one call against `key` and reports whether it was **within**
   * `max` — the same semantics as `AttemptLimiter.consume`: always increments,
   * and the 201st call against a limit of 200 resolves `false`.
   */
  readonly consume: (key: DailyCounterKey, max: number) => Promise<boolean>;
};

/**
 * Narrowed rather than asserted with a generic on `$queryRaw`, for the reason
 * `readSequenceValue` in `lib/document-numbering.ts` gives: the generic is a
 * claim nothing checks. `count` is an `INTEGER`, which the driver hands back
 * as a plain number.
 */
const counterRowsSchema = z
  .array(z.object({ count: z.number().int().positive() }))
  .length(1);

export function createDailyCounter(
  db: Database,
  now: () => Date = () => new Date(),
): DailyCounter {
  return {
    consume: async (key, max) => {
      const at = now();

      // One statement, so two concurrent calls cannot both read the same
      // count and both decide they are under the ceiling — the check-then-act
      // race B4's stock lock and B5's exclusion constraint exist to prevent.
      // Every expression in `DO UPDATE SET` sees the row as it was before the
      // update, so the window test is the same in both `CASE`s.
      const rows: unknown = await db.$queryRaw`
        INSERT INTO "VehicleDataCallCounter" ("key", "windowStartsAt", "count", "updatedAt")
        VALUES (${key}::text, ${at}::timestamptz, 1, ${at}::timestamptz)
        ON CONFLICT ("key") DO UPDATE SET
          "count" = CASE
            WHEN "VehicleDataCallCounter"."windowStartsAt" > EXCLUDED."windowStartsAt" - interval '24 hours'
            THEN "VehicleDataCallCounter"."count" + 1
            ELSE 1
          END,
          "windowStartsAt" = CASE
            WHEN "VehicleDataCallCounter"."windowStartsAt" > EXCLUDED."windowStartsAt" - interval '24 hours'
            THEN "VehicleDataCallCounter"."windowStartsAt"
            ELSE EXCLUDED."windowStartsAt"
          END,
          "updatedAt" = EXCLUDED."updatedAt"
        RETURNING "count"
      `;

      const [row] = counterRowsSchema.parse(rows);
      return row !== undefined && row.count <= max;
    },
  };
}
