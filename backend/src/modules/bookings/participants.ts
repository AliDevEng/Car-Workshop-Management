import {
  isNormalisedRegNr,
  normalisePhone,
  normaliseRegNr,
  type BookingCustomerInput,
  type BookingVehicleInput,
} from 'shared';
import { fieldError } from '../../lib/field-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { createCustomerInTransaction } from '../customers/service.js';
import {
  adoptOwnerlessVehicleInTransaction,
  createVehicleInTransaction,
  fillMissingVehicleFactsInTransaction,
  UNKNOWN_VEHICLE_MAKE,
  UNKNOWN_VEHICLE_MODEL,
} from '../vehicles/service.js';

/**
 * Who a booking is for and what car it concerns — resolved the same way for
 * both of the two paths a booking can arrive by (§6.2).
 *
 * A booking is created either by confirming a public request or by a staff
 * member taking a telephone call. The *decisions* differ (a stranger's typo in
 * a plate must never make a request unconfirmable; a staff member's typo
 * should be pointed at), but the *mechanics* are identical: reuse the customer
 * already on file for this number, reuse the car already on file for this
 * plate, and never duplicate either.
 *
 * Keeping that in one file is what stops the two paths drifting into two
 * different ideas of when a returning customer is the same person. Each caller
 * expresses its own decision by choosing which branch of the input union it
 * builds, and this module never guesses.
 */

/**
 * The customer the booking belongs to: the one the staff member picked, the
 * one already on file for this telephone number, or a new record.
 *
 * Matching on `phoneNormalised` is what makes a returning customer one row
 * rather than five (§8.2). Deterministically the oldest match, so two owners
 * taking two calls from the same person do not attach them to different
 * duplicates; inactive customers are skipped, because reactivating someone by
 * writing them into the calendar is a decision a human should make.
 */
export async function resolveBookingCustomer(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  input: BookingCustomerInput,
): Promise<string> {
  if (input.mode === 'EXISTING') {
    const chosen = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true },
    });
    if (chosen === null) {
      throw fieldError('customer.customerId', 'Kunden kunde inte hittas.');
    }
    return chosen.id;
  }

  const existing = await tx.customer.findFirst({
    where: { phoneNormalised: normalisePhone(input.phone), isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (existing !== null) {
    return existing.id;
  }

  const created = await createCustomerInTransaction(tx, actorId, ipHash, {
    type: input.type ?? 'PRIVATE',
    name: input.name,
    phone: input.phone,
    ...(input.email === undefined ? {} : { email: input.email }),
  });
  return created.id;
}

/**
 * The car, if the booking names one at all.
 *
 * A plate the workshop has seen before is reused rather than duplicated — the
 * unique index would refuse a second row anyway, and the service history hangs
 * off the existing one (§6.3). Reusing it is also why
 * {@link fillMissingVehicleFactsInTransaction} runs here: the existing row may
 * be a placeholder created from a public request, and the make and model the
 * caller just supplied are the first real facts anybody has had about it.
 *
 * An unusable registration number is rejected rather than ignored. Callers
 * that must not reject one — confirming a request a stranger filled in — pass
 * `{ mode: 'NONE' }` instead, which keeps that judgement in the caller where
 * it can be read, rather than hidden in a fallback here.
 */
export async function resolveBookingVehicle(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  input: BookingVehicleInput,
  customerId: string,
): Promise<string | null> {
  if (input.mode === 'NONE') {
    return null;
  }

  if (input.mode === 'EXISTING') {
    const chosen = await tx.vehicle.findUnique({
      where: { id: input.vehicleId },
      select: { id: true },
    });
    if (chosen === null) {
      throw fieldError('vehicle.vehicleId', 'Fordonet kunde inte hittas.');
    }
    await adoptOwnerlessVehicleInTransaction(
      tx,
      actorId,
      ipHash,
      chosen.id,
      customerId,
    );
    return chosen.id;
  }

  const registrationNumber = normaliseRegNr(input.registrationNumber);
  if (!isNormalisedRegNr(registrationNumber)) {
    throw fieldError(
      'vehicle.registrationNumber',
      'Registreringsnumret kunde inte tolkas.',
    );
  }

  const existing = await tx.vehicle.findUnique({
    where: { registrationNumber },
    select: { id: true },
  });
  if (existing !== null) {
    await adoptOwnerlessVehicleInTransaction(
      tx,
      actorId,
      ipHash,
      existing.id,
      customerId,
    );
    await fillMissingVehicleFactsInTransaction(
      tx,
      actorId,
      ipHash,
      existing.id,
      {
        make: input.make,
        model: input.model,
        modelYear: input.modelYear,
      },
    );
    return existing.id;
  }

  const created = await createVehicleInTransaction(tx, actorId, ipHash, {
    // As typed: `createVehicleInTransaction` normalises it and derives the
    // display form, so that the canonical value is computed in exactly one
    // place (§4.2).
    registrationNumber: input.registrationNumber,
    customerId,
    make: input.make ?? UNKNOWN_VEHICLE_MAKE,
    model: input.model ?? UNKNOWN_VEHICLE_MODEL,
    ...(input.modelYear === undefined ? {} : { modelYear: input.modelYear }),
  });
  return created.id;
}
