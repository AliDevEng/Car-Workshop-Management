import {
  ConflictError,
  type Booking,
  type BookingStatus,
  type BookingWithRelations,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';
import {
  postgresErrorCode,
  SQLSTATE_EXCLUSION_VIOLATION,
} from '../../lib/prisma-errors.js';

/**
 * Data access for calendar bookings (PROJECT_SPEC.md §4.2, §6.2, B5.4, B5.5).
 */

const bookingFields = {
  id: true,
  bookingRequestId: true,
  customerId: true,
  vehicleId: true,
  startsAt: true,
  endsAt: true,
  assignedUserId: true,
  status: true,
  note: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * What a calendar cell needs, without a round trip per booking. The related
 * selects are the `*Summary` shapes from `shared`, spelled once here.
 */
const bookingWithRelationsFields = {
  ...bookingFields,
  customer: { select: { id: true, type: true, name: true, phone: true } },
  vehicle: {
    select: {
      id: true,
      registrationNumber: true,
      registrationNumberDisplay: true,
      make: true,
      model: true,
    },
  },
  assignedUser: { select: { id: true, name: true, role: true } },
} as const;

export type BookingRecord = Prisma.BookingGetPayload<{
  select: typeof bookingFields;
}>;

export type BookingWithRelationsRecord = Prisma.BookingGetPayload<{
  select: typeof bookingWithRelationsFields;
}>;

function toBookingDto(record: BookingRecord): Booking {
  return {
    id: record.id,
    bookingRequestId: record.bookingRequestId,
    customerId: record.customerId,
    vehicleId: record.vehicleId,
    startsAt: toIsoDateTime(record.startsAt),
    endsAt: toIsoDateTime(record.endsAt),
    assignedUserId: record.assignedUserId,
    status: record.status,
    note: record.note,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function toBookingWithRelationsDto(
  record: BookingWithRelationsRecord,
): BookingWithRelations {
  return {
    ...toBookingDto(record),
    customer: {
      id: record.customer.id,
      type: record.customer.type,
      name: record.customer.name,
      phone: record.customer.phone,
    },
    vehicle:
      record.vehicle === null
        ? null
        : {
            id: record.vehicle.id,
            registrationNumber: record.vehicle.registrationNumber,
            registrationNumberDisplay: record.vehicle.registrationNumberDisplay,
            make: record.vehicle.make,
            model: record.vehicle.model,
          },
    assignedUser:
      record.assignedUser === null
        ? null
        : {
            id: record.assignedUser.id,
            name: record.assignedUser.name,
            role: record.assignedUser.role,
          },
  };
}

export const BOOKING_OVERLAP_MESSAGE =
  'Tiden krockar med en annan bokning för samma mekaniker. Välj en annan ' +
  'tid eller en annan mekaniker.';

/**
 * Turns the exclusion-constraint violation into the `409` §6.2 promises
 * (B5.4.5).
 *
 * **Two things about this are easy to get wrong and both were measured in
 * B0.10.3.** The match is on SQLSTATE `23P01`, never on a Prisma code: the same
 * violation is `P2039` from `booking.create()` and `P2010` from inside an
 * interactive transaction, so a handler keyed on either one silently never
 * fires and production returns `500`. And the wrapping happens *outside* the
 * transaction — a failed statement aborts the surrounding Postgres transaction,
 * so catching it inside and carrying on issues queries against a transaction
 * that can no longer do anything.
 */
export async function withOverlapConflict<T>(
  run: () => Promise<T>,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (postgresErrorCode(error) === SQLSTATE_EXCLUSION_VIOLATION) {
      throw new ConflictError(BOOKING_OVERLAP_MESSAGE, { cause: error });
    }
    throw error;
  }
}

export type InsertBookingInput = {
  readonly bookingRequestId: string | null;
  readonly customerId: string;
  readonly vehicleId: string | null;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly assignedUserId: string | null;
  readonly status: BookingStatus;
  readonly note: string | null;
};

export function insertBooking(
  tx: Prisma.TransactionClient,
  input: InsertBookingInput,
): Promise<BookingWithRelationsRecord> {
  return tx.booking.create({
    data: {
      bookingRequestId: input.bookingRequestId,
      customerId: input.customerId,
      vehicleId: input.vehicleId,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
      assignedUserId: input.assignedUserId,
      status: input.status,
      note: input.note,
    },
    select: bookingWithRelationsFields,
  });
}

export type UpdateBookingFields = {
  readonly startsAt?: Date;
  readonly endsAt?: Date;
  readonly assignedUserId?: string | null;
  readonly status?: BookingStatus;
  readonly note?: string | null;
};

export function updateBookingRecord(
  tx: Prisma.TransactionClient,
  id: string,
  fields: UpdateBookingFields,
): Promise<BookingWithRelationsRecord> {
  return tx.booking.update({
    where: { id },
    data: { ...fields },
    select: bookingWithRelationsFields,
  });
}

export function findBookingRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<BookingRecord | null> {
  return db.booking.findUnique({ where: { id }, select: bookingFields });
}

export type CalendarWindow = {
  readonly from: Date;
  /** Exclusive, so two adjacent windows neither drop nor repeat a booking. */
  readonly to: Date;
  readonly userId?: string | undefined;
};

/**
 * Every booking that **overlaps** the window, not only those starting inside
 * it: a job that began yesterday and runs until noon belongs on today's
 * calendar, and a view that hid it would be lying about the workshop's day.
 * Cancelled bookings are included — a calendar that silently drops them makes
 * "why is this slot empty?" unanswerable — and the client colours by status.
 *
 * Not paginated: the window is already capped at 90 days (B5.5.1).
 */
export async function listBookingsInWindow(
  db: Database,
  window: CalendarWindow,
): Promise<BookingWithRelations[]> {
  const rows = await db.booking.findMany({
    where: {
      startsAt: { lt: window.to },
      endsAt: { gt: window.from },
      ...(window.userId === undefined ? {} : { assignedUserId: window.userId }),
    },
    select: bookingWithRelationsFields,
    orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
  });

  return rows.map(toBookingWithRelationsDto);
}
