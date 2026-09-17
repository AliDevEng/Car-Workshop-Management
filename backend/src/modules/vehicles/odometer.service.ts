import {
  NotFoundError,
  kmToMil,
  type CreateOdometerReadingInput,
  type OdometerReading,
  type OdometerReadingResponse,
  type OdometerSource,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { fieldError } from '../../lib/field-error.js';
import type { Database } from '../../lib/prisma.js';
import { recomputeRecommendationsForVehicleInTransaction } from '../service-recommendations/service.js';
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

/**
 * How far ahead of the server's clock a reading may be dated.
 *
 * Not zero: a tablet's clock drifts, and refusing a reading because the device
 * is ninety seconds fast would fail a mechanic for something they cannot see or
 * fix. Five minutes absorbs that and nothing else.
 */
const READ_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * A reading cannot be dated in the future, and the reason is the cache rule
 * rather than tidiness.
 *
 * `Vehicle.lastKnownOdometerKm` mirrors the **newest reading by `readAt`**, not
 * the highest km (decision log, 2026-09-09) — which is correct, and is exactly
 * what makes a future date permanent damage: a reading mistyped as 2031 wins
 * that comparison against every real reading taken between now and 2031, so the
 * cached value, the vehicle page and the service-rule engine's km baseline all
 * describe a reading that has not happened. Nothing later corrects it, because
 * nothing later is newer. §3.5 deliberately *accepts* a reading lower than the
 * previous highest and only warns; that tolerance is about the number, and it
 * has never been an argument for accepting an impossible date.
 */
function assertNotInTheFuture(readAt: Date): void {
  if (readAt.getTime() > Date.now() + READ_AT_CLOCK_SKEW_MS) {
    throw fieldError(
      'readAt',
      'Avläsningen kan inte vara gjord i framtiden. Kontrollera datumet.',
    );
  }
}

export type RecordReadingInput = {
  readonly vehicleId: string;
  readonly km: number;
  readonly source: OdometerSource;
  /** Null for a reading imported from an external source (§4.2). */
  readonly userId: string | null;
  readonly readAt?: Date;
  /** Set when the reading came from a work order (B6.7.1). */
  readonly workOrderId?: string | null;
};

/**
 * Writes one reading inside a transaction the **caller** owns, and answers
 * with the §3.5 warning if there is one.
 *
 * Split out for the same reason as `createCustomerInTransaction` in B5:
 * completing a work order writes the out reading, the stock movements and the
 * status change as one atomic unit (§6.5), and copying these fifteen lines
 * into that module would give the cache rule and the warning text two
 * definitions each — and the one that drifts would be the one the mechanic
 * actually reads.
 */
export async function recordOdometerReadingInTransaction(
  tx: Prisma.TransactionClient,
  input: RecordReadingInput,
): Promise<{ reading: OdometerReading; warnings: string[] }> {
  const readAt = input.readAt ?? new Date();
  assertNotInTheFuture(readAt);

  const previousHighest = await highestRecordedKm(tx, input.vehicleId);

  const reading = await insertReading(tx, {
    vehicleId: input.vehicleId,
    km: input.km,
    readAt,
    source: input.source,
    userId: input.userId,
    workOrderId: input.workOrderId ?? null,
  });

  // Refresh the cache from the newest reading *including this one*, so a
  // correction dated earlier than the latest does not overwrite it.
  const newest = await newestReadingKm(tx, input.vehicleId);
  await tx.vehicle.update({
    where: { id: input.vehicleId },
    data: { lastKnownOdometerKm: newest ?? input.km },
  });

  // B9.4.2/B9.6.1: every odometer change — manual, or a work order's in/out
  // reading via B6 — is a recompute trigger, because the km side of a due
  // calculation only ever moves here.
  await recomputeRecommendationsForVehicleInTransaction(tx, input.vehicleId);

  const warnings: string[] = [];
  if (previousHighest !== null && input.km < previousHighest) {
    warnings.push(
      `Den nya mätarställningen (${milText(input.km)} mil) är lägre än den ` +
        `tidigare högsta (${milText(previousHighest)} mil). Kontrollera att ` +
        `den stämmer.`,
    );
  }

  return { reading: toOdometerReadingDto(reading), warnings };
}

export async function recordManualOdometerReading(
  db: Database,
  actorId: string,
  vehicleId: string,
  input: CreateOdometerReadingInput,
): Promise<OdometerReadingResponse> {
  return db.$transaction(async (tx) => {
    await assertVehicleExists(tx, vehicleId);

    return recordOdometerReadingInTransaction(tx, {
      vehicleId,
      km: input.km,
      // A reading posted to this endpoint is manual by definition; the
      // work-order in/out sources are set by B6, not chosen by the caller.
      source: 'MANUAL',
      userId: actorId,
      ...(input.readAt === undefined ? {} : { readAt: new Date(input.readAt) }),
    });
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
