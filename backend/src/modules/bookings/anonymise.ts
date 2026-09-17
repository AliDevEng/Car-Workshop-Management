import { writeAuditLog } from '../../lib/audit.js';
import type { AnyDbClient } from '../../lib/prisma.js';
import { ANONYMISED_PHONE } from '../customers/gdpr.service.js';

/**
 * Blanking the personal data on a `BookingRequest` (PROJECT_SPEC.md §5.5).
 *
 * **Why this is its own module.** Two unrelated rules erase a booking request
 * and both are §5.5's:
 *
 * 1. Retention — `REJECTED`/`SPAM` rows, 90 days after submission
 *    (`jobs/retention.ts`).
 * 2. Erasure — a customer asks to be forgotten, and their requests are as much
 *    "everything held about one person" as their `Customer` row is
 *    (`modules/customers/gdpr.service.ts`).
 *
 * Only the first existed. A customer could be anonymised and their booking
 * requests kept their name, telephone number and e-mail address indefinitely,
 * because no retention deadline applies to a `CONFIRMED` one — measured by
 * anonymising a customer and reading the row back. The second rule needs
 * exactly the blanking the first already performed, so it gets one definition
 * here rather than a copy that drifts: a placeholder changed in one place and
 * not the other would leave two spellings of "erased" in one table, and only
 * one of them searchable.
 */

/** Mirrors `Customer.name` becoming `Raderad kund`. */
export const ANONYMISED_BOOKING_REQUEST_NAME = 'Raderad förfrågan';

export type BookingRequestIdentity = {
  readonly id: string;
  readonly customerName: string;
  readonly phone: string;
  readonly email: string | null;
};

/**
 * Blanks one request and records it. The caller has already decided *which*
 * rows qualify — that is the part the two rules disagree about — and has
 * already filtered out rows whose `anonymisedAt` is set, which is what stops a
 * second pass writing an indistinguishable second audit entry.
 *
 * `message` goes too: §5.5 minimises to "name, phone, optional email,
 * registration number and a free-text message", and free text is where a
 * person writes the thing nobody thought to put in a column.
 */
export async function anonymiseBookingRequest(
  db: AnyDbClient,
  request: BookingRequestIdentity,
  now: Date,
  actorId: string | null = null,
): Promise<void> {
  await db.bookingRequest.update({
    where: { id: request.id },
    data: {
      customerName: ANONYMISED_BOOKING_REQUEST_NAME,
      phone: ANONYMISED_PHONE,
      email: null,
      message: null,
      anonymisedAt: now,
    },
  });

  await writeAuditLog(db, {
    userId: actorId,
    action: 'booking_request.anonymised',
    entityType: 'BookingRequest',
    entityId: request.id,
    before: {
      customerName: request.customerName,
      phone: request.phone,
      email: request.email,
    },
    after: { customerName: ANONYMISED_BOOKING_REQUEST_NAME },
  });
}

/**
 * Every not-yet-anonymised request that reaches this customer through a
 * booking (§4.2: `BookingRequest` ← `Booking` → `Customer`).
 *
 * The join is the only link there is — a `BookingRequest` carries no
 * `customerId`, by design, because it is written by an anonymous visitor
 * before anyone knows who they are (§6.2). Confirming one is what creates the
 * `Booking` that ties the two together, so a *pending* request from the same
 * person is deliberately **not** matched: nothing in the system claims it is
 * theirs, and guessing by name or telephone number would erase a stranger's
 * request on a coincidence.
 */
export async function findBookingRequestsForCustomer(
  db: AnyDbClient,
  customerId: string,
): Promise<BookingRequestIdentity[]> {
  return db.bookingRequest.findMany({
    where: {
      anonymisedAt: null,
      booking: { customerId },
    },
    select: { id: true, customerName: true, phone: true, email: true },
  });
}
