import {
  NotFoundError,
  kmToMil,
  type CreateOdometerReadingInput,
  type OdometerReading,
  type OdometerReadingResponse,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  highestRecordedKm,
  insertReading,
  listReadings,
  newestReadingKm,
  toOdometerReadingDto,
  type ListReadingsOptions,
} from './odometer.repository.js';

/**
 * Odometer history (PROJECT_SPEC.md §3.5, §4.2, B3.3).
 *
 * A reading below the vehicle's previous highest is **accepted** — clusters
 * get replaced and imports happen — but the response carries a warning for a
 * human to confirm. Rejecting it would leave a mechanic unable to record what
 * the car actually shows.
 *
 * The `mil` unit in the warning text is deliberate: Swedish workshops speak in
 * mil, and this string is shown to a person. The conversion still happens only
 * in `shared/units.ts`.
 */

/** `kmToMil` returns `1200.0`; a Swedish sentence wants `1200,0`. */
function milText(km: number): string {
  return kmToMil(km).replace('.', ',');
}

async function assertVehicleExists(
  db: Database | Prisma.TransactionClient,
  vehicleId: string,
): Promise<void> {
  const vehicle = await db.vehicle.findUnique({
    where: { id: vehicleId },
    select: { id: true },
  });
  if (vehicle === null) {
    throw new NotFoundError('Fordonet kunde inte hittas.');
  }
}

export async function recordManualOdometerReading(
  db: Database,
  actorId: string,
  vehicleId: string,
  input: CreateOdometerReadingInput,
): Promise<OdometerReadingResponse> {
  const readAt = input.readAt === undefined ? new Date() : new Date(input.readAt);

  return db.$transaction(async (tx) => {
    await assertVehicleExists(tx, vehicleId);

    const previousHighest = await highestRecordedKm(tx, vehicleId);

    const reading = await insertReading(tx, {
      vehicleId,
      km: input.km,
      readAt,
      // A reading posted to this endpoint is manual by definition; the
      // work-order in/out sources are set by B6, not chosen by the caller.
      source: 'MANUAL',
      userId: actorId,
    });

    // Refresh the cache from the newest reading *including this one*, so a
    // correction dated earlier than the latest does not overwrite it.
    const newest = await newestReadingKm(tx, vehicleId);
    await tx.vehicle.update({
      where: { id: vehicleId },
      data: { lastKnownOdometerKm: newest ?? input.km },
    });

    const warnings: string[] = [];
    if (previousHighest !== null && input.km < previousHighest) {
      warnings.push(
        `Den nya mätarställningen (${milText(input.km)} mil) är lägre än den ` +
          `tidigare högsta (${milText(previousHighest)} mil). Kontrollera att ` +
          `den stämmer.`,
      );
    }

    return { reading: toOdometerReadingDto(reading), warnings };
  });
}

export async function getOdometerReadings(
  db: Database,
  vehicleId: string,
  options: ListReadingsOptions,
): Promise<{ data: OdometerReading[]; nextCursor: string | null }> {
  await assertVehicleExists(db, vehicleId);
  return listReadings(db, vehicleId, options);
}
