import type { AnyDbClient } from '../lib/prisma.js';
import { anonymiseBookingRequest } from '../modules/bookings/anonymise.js';
import { anonymiseCustomerInTransaction } from '../modules/customers/gdpr.service.js';
import type { JobLogger } from './lock.js';

/**
 * The nightly retention sweep (PROJECT_SPEC.md §5.5, B11.3.4).
 *
 * Two independent rules, both from §5.5, run together because both are "find
 * rows past a deadline and anonymise them" — but they touch different tables
 * and neither depends on the other's outcome.
 */

const REJECTED_OR_SPAM_RETENTION_DAYS = 90;
const CUSTOMER_INACTIVITY_RETENTION_MONTHS = 36;

function daysAgo(from: Date, days: number): Date {
  return new Date(from.getTime() - days * 24 * 60 * 60 * 1000);
}

function monthsAgo(from: Date, months: number): Date {
  const result = new Date(from);
  result.setUTCMonth(result.getUTCMonth() - months);
  return result;
}

/**
 * `BookingRequest` rows with status `REJECTED` or `SPAM`, 90 days after
 * submission. `anonymisedAt` (added for this job, mirroring
 * `Customer.anonymisedAt`) is what keeps a second night's run from touching
 * a row it already blanked and writing an indistinguishable second audit
 * entry for it.
 */
async function anonymiseStaleBookingRequests(
  db: AnyDbClient,
  now: Date,
): Promise<number> {
  const cutoff = daysAgo(now, REJECTED_OR_SPAM_RETENTION_DAYS);

  const candidates = await db.bookingRequest.findMany({
    where: {
      status: { in: ['REJECTED', 'SPAM'] },
      submittedAt: { lt: cutoff },
      anonymisedAt: null,
    },
    select: { id: true, customerName: true, phone: true, email: true },
  });

  // The blanking itself lives in `modules/bookings/anonymise.ts`, because
  // §5.5's *other* rule — a customer's own erasure request — has to perform
  // exactly the same one, and two copies of "what erased looks like" is two
  // spellings of it in one table.
  for (const candidate of candidates) {
    await anonymiseBookingRequest(db, candidate, now);
  }

  return candidates.length;
}

/**
 * Customers with no work order in the last 36 months. A customer created
 * *within* that window but with no work order yet is not stale — they are
 * new — so eligibility requires both that the customer itself is old enough
 * and that every one of their work orders (zero or more) is old enough.
 */
async function anonymiseInactiveCustomers(
  db: AnyDbClient,
  now: Date,
): Promise<number> {
  const cutoff = monthsAgo(now, CUSTOMER_INACTIVITY_RETENTION_MONTHS);

  const candidates = await db.customer.findMany({
    where: {
      anonymisedAt: null,
      createdAt: { lt: cutoff },
      workOrders: { none: { createdAt: { gte: cutoff } } },
    },
    select: { id: true },
  });

  for (const candidate of candidates) {
    await anonymiseCustomerInTransaction(db, null, null, candidate.id);
  }

  return candidates.length;
}

export async function runRetentionSweep(
  db: AnyDbClient,
  logger: JobLogger,
  now: Date = new Date(),
): Promise<{
  readonly bookingRequestsAnonymised: number;
  readonly customersAnonymised: number;
}> {
  const bookingRequestsAnonymised = await anonymiseStaleBookingRequests(
    db,
    now,
  );
  const customersAnonymised = await anonymiseInactiveCustomers(db, now);

  logger.info(
    { job: 'retention', bookingRequestsAnonymised, customersAnonymised },
    `Retention sweep anonymised ${String(bookingRequestsAnonymised)} ` +
      `booking request(s) and ${String(customersAnonymised)} customer(s)`,
  );

  return { bookingRequestsAnonymised, customersAnonymised };
}
