import {
  NotFoundError,
  ValidationError,
  BOOKING_INTERVAL_MESSAGE,
  isPositiveInterval,
  stockholmDate,
  stockholmDayEnd,
  stockholmDayStart,
  type BookingWithRelations,
  type CalendarQuery,
  type CalendarResponse,
  type UpdateBookingInput,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';
import type { Database } from '../../lib/prisma.js';
import { assertAssignableUser } from './assignment.js';
import {
  findBookingRecord,
  listBookingsInWindow,
  toBookingWithRelationsDto,
  updateBookingRecord,
  withOverlapConflict,
  type BookingRecord,
  type UpdateBookingFields,
} from './booking.repository.js';

/**
 * The calendar (PROJECT_SPEC.md §6.2, §3.6; B5.5).
 */

/**
 * Widens the requested window to whole **Europe/Stockholm** days (B5.5.3).
 *
 * The wire format is UTC instants, as everywhere else (§3.6), but a calendar
 * is a local thing: a client asking for "tisdagen den 29 mars" must get all of
 * it, and 29 March 2026 is 23 hours long while 25 October is 25. Deriving both
 * boundaries from `shared/time.ts` means the length of a day is a property of
 * the timezone rather than of whichever caller did the arithmetic — and a
 * client that already sent exact local midnights gets its own window back
 * unchanged, because widening a whole day to itself is a no-op.
 *
 * The response echoes the window actually used, so a view can label its
 * columns from the answer instead of recomputing it and disagreeing.
 */
function toStockholmWindow(query: CalendarQuery): { from: Date; to: Date } {
  return {
    from: stockholmDayStart(stockholmDate(new Date(query.from))),
    to: stockholmDayEnd(stockholmDate(new Date(query.to))),
  };
}

export async function getCalendar(
  db: Database,
  query: CalendarQuery,
): Promise<CalendarResponse> {
  const window = toStockholmWindow(query);

  const data = await listBookingsInWindow(db, {
    ...window,
    userId: query.userId,
  });

  return {
    data,
    from: toIsoDateTime(window.from),
    to: toIsoDateTime(window.to),
  };
}

/**
 * The fields a patch would leave the booking with. Validation is done on the
 * **merged** result, not on the body: a request moving only `endsAt` can still
 * produce an interval that runs backwards, and a body-level check would miss
 * exactly that case.
 */
function mergedInterval(
  before: BookingRecord,
  input: UpdateBookingInput,
): { startsAt: Date; endsAt: Date } {
  return {
    startsAt:
      input.startsAt === undefined ? before.startsAt : new Date(input.startsAt),
    endsAt: input.endsAt === undefined ? before.endsAt : new Date(input.endsAt),
  };
}

/** What the audit log records about a booking. */
function auditSnapshot(record: BookingRecord): Record<string, unknown> {
  return {
    startsAt: toIsoDateTime(record.startsAt),
    endsAt: toIsoDateTime(record.endsAt),
    assignedUserId: record.assignedUserId,
    status: record.status,
    note: record.note,
  };
}

/**
 * Reschedule, reassign or change status (B5.5.2).
 *
 * All three go through one endpoint because all three are the same write to
 * the calendar and all three can collide with the same constraint — a
 * "reassign" route that forgot to handle `23P01` would move a mechanic onto
 * an occupied slot and return a `500`. A booking's status is audited because
 * §4.2 audits status changes.
 */
export async function updateBooking(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateBookingInput,
): Promise<BookingWithRelations> {
  // Outside the transaction, for the same reason as confirmation: a 23P01
  // aborts the surrounding Postgres transaction, so it cannot be caught and
  // recovered from inside one.
  return withOverlapConflict(() =>
    db.$transaction(async (tx) => {
      const before = await findBookingRecord(tx, id);
      if (before === null) {
        throw new NotFoundError('Bokningen kunde inte hittas.');
      }

      const interval = mergedInterval(before, input);
      if (
        !isPositiveInterval(
          interval.startsAt.toISOString(),
          interval.endsAt.toISOString(),
        )
      ) {
        throw new ValidationError('Uppgifterna kunde inte valideras.', {
          details: [{ path: 'endsAt', message: BOOKING_INTERVAL_MESSAGE }],
        });
      }

      if (typeof input.assignedUserId === 'string') {
        await assertAssignableUser(tx, input.assignedUserId);
      }

      const fields: UpdateBookingFields = {
        ...(input.startsAt === undefined
          ? {}
          : { startsAt: interval.startsAt }),
        ...(input.endsAt === undefined ? {} : { endsAt: interval.endsAt }),
        // `undefined` leaves the mechanic alone, `null` unassigns, a string
        // reassigns — the three states the customer relation uses on vehicles.
        ...(input.assignedUserId === undefined
          ? {}
          : { assignedUserId: input.assignedUserId }),
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(input.note === undefined ? {} : { note: input.note }),
      };

      const after = await updateBookingRecord(tx, id, fields);

      await writeAuditLog(tx, {
        userId: actorId,
        action: 'booking.updated',
        entityType: 'Booking',
        entityId: id,
        before: auditSnapshot(before),
        after: auditSnapshot(after),
        ipHash,
      });

      return toBookingWithRelationsDto(after);
    }),
  );
}
