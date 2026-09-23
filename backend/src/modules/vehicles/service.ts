import {
  NotFoundError,
  ValidationError,
  formatRegNrForDisplay,
  isNonStandardPlate,
  isNormalisedRegNr,
  normaliseRegNr,
  type CreateVehicleInput,
  type UpdateVehicleInput,
  type Vehicle,
  type VehicleDetail,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { Database } from '../../lib/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  findVehicleByRegistrationNumber,
  findVehicleWithCustomer,
  toVehicleDetailDto,
  toVehicleDto,
  VEHICLE_SELECT,
  type VehicleRecord,
} from './repository.js';

/**
 * Vehicle records (PROJECT_SPEC.md §4.2, §6.3, B3.2).
 *
 * The registration number is normalised here and only here for storage — the
 * client sends it as typed and never computes the canonical form, or two
 * clients would eventually compute it differently. Owner changes and technical
 * edits are audited because a reassignment touches who a car's history belongs
 * to.
 */

function auditSnapshot(record: VehicleRecord): Record<string, unknown> {
  return {
    registrationNumber: record.registrationNumber,
    customerId: record.customerId,
    make: record.make,
    model: record.model,
    modelYear: record.modelYear,
    nextInspectionDueDate: record.nextInspectionDueDate,
  };
}

/**
 * The three registration-number columns, derived from one typed input:
 * the canonical form the unique index lives on, the spaced display form, and
 * the flag that lets a personalised plate or an import through instead of
 * blocking a booking (§4.2).
 */
function registrationFields(input: string): {
  registrationNumber: string;
  registrationNumberDisplay: string;
  isNonStandardPlate: boolean;
} {
  const registrationNumber = normaliseRegNr(input);
  if (!isNormalisedRegNr(registrationNumber)) {
    throw new ValidationError('Uppgifterna kunde inte valideras.', {
      details: [
        {
          path: 'registrationNumber',
          message: 'Registreringsnumret kunde inte tolkas.',
        },
      ],
    });
  }

  return {
    registrationNumber,
    registrationNumberDisplay: formatRegNrForDisplay(input),
    isNonStandardPlate: isNonStandardPlate(registrationNumber),
  };
}

/**
 * A `date` column takes a `Date` at UTC midnight; the input is `YYYY-MM-DD`.
 *
 * `null` passes straight through: on the update contract a date field is
 * nullable, where `undefined` means "leave alone" and `null` means "clear"
 * (`shared`'s `updateVehicleInputSchema`).
 */
function toDateColumn(value: string): Date;
function toDateColumn(value: string | null): Date | null;
function toDateColumn(value: string | null): Date | null {
  return value === null ? null : new Date(`${value}T00:00:00.000Z`);
}

async function assertCustomerExists(
  db: Database | Prisma.TransactionClient,
  customerId: string,
): Promise<void> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (customer === null) {
    throw new ValidationError('Uppgifterna kunde inte valideras.', {
      details: [{ path: 'customerId', message: 'Kunden kunde inte hittas.' }],
    });
  }
}

export async function getVehicleDetail(
  db: Database,
  id: string,
): Promise<VehicleDetail> {
  const record = await findVehicleWithCustomer(db, id);
  if (record === null) {
    throw new NotFoundError('Fordonet kunde inte hittas.');
  }
  return toVehicleDetailDto(record);
}

export async function getVehicleByRegNr(
  db: Database,
  regnr: string,
): Promise<VehicleDetail> {
  const normalised = normaliseRegNr(regnr);
  const record = isNormalisedRegNr(normalised)
    ? await findVehicleByRegistrationNumber(db, normalised)
    : null;
  if (record === null) {
    throw new NotFoundError('Fordonet kunde inte hittas.');
  }
  return toVehicleDetailDto(record);
}

/**
 * Creates a vehicle inside a transaction the **caller** owns.
 *
 * Exported for the same reason as `createCustomerInTransaction`: confirming a
 * booking request creates the customer, the vehicle and the booking as one
 * atomic unit (§6.2, B5.3.3). Sharing this keeps registration-number
 * normalisation and the audit row in one place instead of two.
 */
export async function createVehicleInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  input: CreateVehicleInput,
): Promise<Vehicle> {
  const registration = registrationFields(input.registrationNumber);

  if (input.customerId !== undefined) {
    await assertCustomerExists(tx, input.customerId);
  }

  const created = await tx.vehicle.create({
    data: {
      ...registration,
      ...(input.customerId === undefined
        ? {}
        : { customerId: input.customerId }),
      make: input.make,
      model: input.model,
      ...(input.variant === undefined ? {} : { variant: input.variant }),
      ...(input.modelYear === undefined ? {} : { modelYear: input.modelYear }),
      ...(input.vin === undefined ? {} : { vin: input.vin }),
      ...(input.engineCode === undefined
        ? {}
        : { engineCode: input.engineCode }),
      ...(input.fuelType === undefined ? {} : { fuelType: input.fuelType }),
      ...(input.firstRegistrationDate === undefined
        ? {}
        : { firstRegistrationDate: toDateColumn(input.firstRegistrationDate) }),
      ...(input.lastInspectionDate === undefined
        ? {}
        : { lastInspectionDate: toDateColumn(input.lastInspectionDate) }),
      ...(input.nextInspectionDueDate === undefined
        ? {}
        : { nextInspectionDueDate: toDateColumn(input.nextInspectionDueDate) }),
    },
    select: VEHICLE_SELECT,
  });

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'vehicle.created',
    entityType: 'Vehicle',
    entityId: created.id,
    after: auditSnapshot(created),
    ipHash,
  });

  return toVehicleDto(created);
}

export function createVehicle(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreateVehicleInput,
): Promise<Vehicle> {
  return db.$transaction((tx) =>
    createVehicleInTransaction(tx, actorId, ipHash, input),
  );
}

/**
 * Gives an **ownerless** vehicle an owner, inside the caller's transaction.
 *
 * Confirming a booking request is the moment a plate stops being anonymous:
 * the car may already exist because someone looked it up on the public start
 * page (§6.1), where requiring an owner is exactly what §4.2 refuses to do.
 * A vehicle that already has an owner is left alone — reassigning a car
 * because a name and a plate arrived in the same form is a decision for a
 * human, on the vehicle page, not a side effect of accepting a booking.
 */
export async function adoptOwnerlessVehicleInTransaction(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  vehicleId: string,
  customerId: string,
): Promise<void> {
  const before = await tx.vehicle.findUnique({
    where: { id: vehicleId },
    select: VEHICLE_SELECT,
  });
  if (before === null || before.customerId !== null) {
    return;
  }

  const after = await tx.vehicle.update({
    where: { id: vehicleId },
    data: { customerId },
    select: VEHICLE_SELECT,
  });

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'vehicle.updated',
    entityType: 'Vehicle',
    entityId: vehicleId,
    before: auditSnapshot(before),
    after: auditSnapshot(after),
    ipHash,
  });
}

export async function updateVehicle(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateVehicleInput,
): Promise<Vehicle> {
  const registration =
    input.registrationNumber === undefined
      ? undefined
      : registrationFields(input.registrationNumber);

  return db.$transaction(async (tx) => {
    const before = await tx.vehicle.findUnique({
      where: { id },
      select: VEHICLE_SELECT,
    });
    if (before === null) {
      throw new NotFoundError('Fordonet kunde inte hittas.');
    }

    // `undefined` leaves the owner alone; `null` detaches it; a string
    // reassigns — and the vehicle keeps its odometer and service history
    // either way, because history hangs off the vehicle (§6.3).
    if (typeof input.customerId === 'string') {
      await assertCustomerExists(tx, input.customerId);
    }

    const after = await tx.vehicle.update({
      where: { id },
      data: {
        ...(registration ?? {}),
        ...(input.customerId === undefined
          ? {}
          : { customerId: input.customerId }),
        ...(input.make === undefined ? {} : { make: input.make }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.variant === undefined ? {} : { variant: input.variant }),
        ...(input.modelYear === undefined
          ? {}
          : { modelYear: input.modelYear }),
        ...(input.vin === undefined ? {} : { vin: input.vin }),
        ...(input.engineCode === undefined
          ? {}
          : { engineCode: input.engineCode }),
        ...(input.fuelType === undefined ? {} : { fuelType: input.fuelType }),
        ...(input.firstRegistrationDate === undefined
          ? {}
          : {
              firstRegistrationDate: toDateColumn(input.firstRegistrationDate),
            }),
        ...(input.lastInspectionDate === undefined
          ? {}
          : { lastInspectionDate: toDateColumn(input.lastInspectionDate) }),
        ...(input.nextInspectionDueDate === undefined
          ? {}
          : {
              nextInspectionDueDate: toDateColumn(input.nextInspectionDueDate),
            }),
      },
      select: VEHICLE_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'vehicle.updated',
      entityType: 'Vehicle',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toVehicleDto(after);
  });
}
