import { NotFoundError, type Customer, type CustomerExport } from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { AnyDbClient, Database } from '../../lib/prisma.js';
import {
  anonymiseBookingRequest,
  findBookingRequestsForCustomer,
} from '../bookings/anonymise.js';
import { gatherCustomerExport } from './gdpr.repository.js';
import { CUSTOMER_SELECT, toCustomerDto } from './repository.js';
import { auditSnapshot, CUSTOMER_NOT_FOUND } from './service.js';

/**
 * GDPR export and erasure (PROJECT_SPEC.md §5.5, B11.2).
 *
 * The workshop is the data controller; these two routes are how it answers a
 * customer's own request. Neither is reachable except by `ADMIN` (B11.6.1) —
 * an export is the single largest concentration of one person's personal data
 * anywhere in the system, and an anonymisation is irreversible in the way §5.5
 * describes.
 */

export async function exportCustomerData(
  db: Database,
  id: string,
): Promise<CustomerExport> {
  const gathered = await gatherCustomerExport(db, id);
  if (gathered === null) {
    throw new NotFoundError(CUSTOMER_NOT_FOUND);
  }
  return { exportedAt: new Date().toISOString(), ...gathered };
}

/**
 * A phone number that identifies nobody, kept because the column itself is
 * required (§4.2) and `phoneSchema` demands at least six digit/`+()-.`/space
 * characters — an empty string satisfies neither, and reached this as a
 * `500 FST_ERR_RESPONSE_SERIALIZATION` the first time this was written with
 * `''`: the response schema rejected the very value meant to erase the real
 * one. Exported because `BookingRequest.phone` carries the same `phoneSchema`
 * and the retention job (B11.3.4) hits the identical trap. `phoneNormalised`
 * has no such format and stays the empty string.
 */
export const ANONYMISED_PHONE = '000-000 00 00';

/**
 * §5.5's resolution of the erasure conflict: the workshop must retain
 * accounting-relevant records for seven years, so the customer is anonymised
 * rather than deleted. `phone` cannot be `null` because the column is not
 * nullable (§4.2 lists phone as the required contact channel), so it becomes
 * a placeholder that identifies nobody rather than a real number.
 *
 * Idempotent: calling this on an already-anonymised customer returns the
 * current row rather than writing a second, indistinguishable audit entry —
 * the same idiom `deactivateCustomer`/`reactivateCustomer` already use for a
 * repeated state change.
 *
 * Composable into a caller's own transaction — the retention job (B11.3.4)
 * anonymises many customers as one atomic sweep, the same reason
 * `createCustomerInTransaction` exists beside `createCustomer`. `actorId` is
 * nullable because that job is not a person (§8.4).
 */
export async function anonymiseCustomerInTransaction(
  tx: AnyDbClient,
  actorId: string | null,
  ipHash: string | null,
  id: string,
): Promise<Customer> {
  const before = await tx.customer.findUnique({
    where: { id },
    select: CUSTOMER_SELECT,
  });
  if (before === null) {
    throw new NotFoundError(CUSTOMER_NOT_FOUND);
  }

  if (before.anonymisedAt !== null) {
    return toCustomerDto(before);
  }

  const now = new Date();

  // §5.5's erasure reaches **everything held about this person**, and their
  // booking requests hold as much of it as the `Customer` row does: the name
  // they gave, their telephone number, their e-mail address and whatever they
  // wrote in the free-text message.
  //
  // Only the retention rule used to touch these, and it only ever looks at
  // `REJECTED`/`SPAM` rows 90 days old — so a `CONFIRMED` request, which is
  // every request belonging to a customer who actually became one, kept its
  // personal data for ever. Measured by anonymising a customer and reading the
  // row straight back out.
  //
  // Before the customer row itself, so the audit entries read in the order the
  // erasure happened rather than trailing after the record that prompted it.
  const requests = await findBookingRequestsForCustomer(tx, id);
  for (const request of requests) {
    await anonymiseBookingRequest(tx, request, now, actorId);
  }

  const after = await tx.customer.update({
    where: { id },
    data: {
      name: 'Raderad kund',
      orgNumber: null,
      email: null,
      phone: ANONYMISED_PHONE,
      phoneNormalised: '',
      address: null,
      notes: null,
      anonymisedAt: now,
    },
    select: CUSTOMER_SELECT,
  });

  await writeAuditLog(tx, {
    userId: actorId,
    action: 'customer.anonymised',
    entityType: 'Customer',
    entityId: id,
    before: auditSnapshot(before),
    after: auditSnapshot(after),
    ipHash,
  });

  return toCustomerDto(after);
}

/** The route entry point: opens its own transaction around the core above. */
export function anonymiseCustomer(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<Customer> {
  return db.$transaction((tx) =>
    anonymiseCustomerInTransaction(tx, actorId, ipHash, id),
  );
}
