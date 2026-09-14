import { vehicleDataResultSchema, type VehicleDataResult } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { toIsoDateOrNull } from '../../lib/dto-dates.js';
import type { Database } from '../../lib/prisma.js';

/**
 * Data access for the vehicle-data cache history (PROJECT_SPEC.md §7.1,
 * B10.2.1).
 *
 * `Vehicle`'s own columns are the cache a lookup actually reads — see the
 * module comment on the Prisma model. This file only ever **writes**
 * `VehicleDataSnapshot`; nothing in this iteration reads it back.
 */

export function insertVehicleDataSnapshot(
  tx: Prisma.TransactionClient,
  input: {
    readonly vehicleId: string;
    readonly providerName: string;
    readonly fetchedAt: Date;
    readonly data: VehicleDataResult;
  },
): Promise<{ id: string }> {
  return tx.vehicleDataSnapshot.create({
    data: {
      vehicleId: input.vehicleId,
      providerName: input.providerName,
      fetchedAt: input.fetchedAt,
      dataJson: input.data,
    },
    select: { id: true },
  });
}

/** A `date` column takes a `Date` at UTC midnight; the input is `YYYY-MM-DD`. */
function toDateColumnOrNull(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

/**
 * Reconstructs the `VehicleDataResult` shape straight from `Vehicle`'s own
 * cached columns — the same fields the provider fills in, read back out.
 * Used for a cache hit and for the honest "here is what we last knew" answer
 * when the ceiling or the breaker refuses a fresh call.
 */
export function vehicleDataResultFromCache(vehicle: {
  readonly registrationNumber: string;
  readonly make: string;
  readonly model: string;
  readonly variant: string | null;
  readonly modelYear: number | null;
  readonly vin: string | null;
  readonly engineCode: string | null;
  readonly fuelType: string | null;
  readonly firstRegistrationDate: Date | null;
  readonly lastInspectionDate: Date | null;
  readonly nextInspectionDueDate: Date | null;
}): VehicleDataResult {
  return vehicleDataResultSchema.parse({
    registrationNumber: vehicle.registrationNumber,
    make: vehicle.make,
    model: vehicle.model,
    variant: vehicle.variant,
    modelYear: vehicle.modelYear,
    vin: vehicle.vin,
    engineCode: vehicle.engineCode,
    fuelType: vehicle.fuelType,
    firstRegistrationDate: toIsoDateOrNull(vehicle.firstRegistrationDate),
    lastInspectionDate: toIsoDateOrNull(vehicle.lastInspectionDate),
    nextInspectionDueDate: toIsoDateOrNull(vehicle.nextInspectionDueDate),
  });
}

/**
 * Writes a provider result onto the `Vehicle` cache columns, inside the
 * caller's transaction. Never touches `customerId` — a lookup must not
 * silently attach or detach an owner.
 */
export function applyVehicleDataResult(
  tx: Prisma.TransactionClient,
  vehicleId: string,
  data: VehicleDataResult,
  fetchedAt: Date,
): Promise<unknown> {
  return tx.vehicle.update({
    where: { id: vehicleId },
    data: {
      make: data.make,
      model: data.model,
      variant: data.variant,
      modelYear: data.modelYear,
      vin: data.vin,
      engineCode: data.engineCode,
      fuelType: data.fuelType,
      firstRegistrationDate: toDateColumnOrNull(data.firstRegistrationDate),
      lastInspectionDate: toDateColumnOrNull(data.lastInspectionDate),
      nextInspectionDueDate: toDateColumnOrNull(data.nextInspectionDueDate),
      dataFetchedAt: fetchedAt,
    },
  });
}

const vehicleForLookupFields = {
  id: true,
  registrationNumber: true,
  registrationNumberDisplay: true,
  isNonStandardPlate: true,
  make: true,
  model: true,
  variant: true,
  modelYear: true,
  vin: true,
  engineCode: true,
  fuelType: true,
  firstRegistrationDate: true,
  lastInspectionDate: true,
  nextInspectionDueDate: true,
  dataFetchedAt: true,
} as const;

export type VehicleForLookup = Prisma.VehicleGetPayload<{
  select: typeof vehicleForLookupFields;
}>;

export function findVehicleForLookup(
  db: Database | Prisma.TransactionClient,
  registrationNumber: string,
): Promise<VehicleForLookup | null> {
  return db.vehicle.findUnique({
    where: { registrationNumber },
    select: vehicleForLookupFields,
  });
}

export function findVehicleForLookupById(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<VehicleForLookup | null> {
  return db.vehicle.findUnique({
    where: { id },
    select: vehicleForLookupFields,
  });
}
