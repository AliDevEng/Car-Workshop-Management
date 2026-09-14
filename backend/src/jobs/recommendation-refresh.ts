import type { AnyDbClient } from '../lib/prisma.js';
import { recomputeRecommendationsForVehicleInTransaction } from '../modules/service-recommendations/service.js';
import type { JobLogger } from './lock.js';

/**
 * The nightly "inspection scan" (PROJECT_SPEC.md §8.4, B9.4–B9.6, B11.3.3).
 *
 * Every vehicle is recomputed the same way an odometer reading or a work-order
 * completion already triggers it (B9.4.2, B9.6.1) — this job exists only to
 * catch the recommendations that shift with *time* rather than with an event:
 * a due date crossing into `DUE_SOON`, or a car nobody has touched in months
 * quietly becoming `OVERDUE`. Nothing here invents a decision — a freshly
 * computed row always starts `SUGGESTED`, and an existing human decision is
 * left untouched, exactly as `recomputeRecommendationsForVehicleInTransaction`
 * already guarantees.
 */
export async function refreshServiceRecommendations(
  db: AnyDbClient,
  logger: JobLogger,
  today: Date = new Date(),
): Promise<{ readonly vehicleCount: number }> {
  const vehicles = await db.vehicle.findMany({ select: { id: true } });

  for (const vehicle of vehicles) {
    await recomputeRecommendationsForVehicleInTransaction(
      db,
      vehicle.id,
      today,
    );
  }

  logger.info(
    { job: 'recommendation-refresh', vehicleCount: vehicles.length },
    `Refreshed service recommendations for ${String(vehicles.length)} vehicle(s)`,
  );

  return { vehicleCount: vehicles.length };
}
