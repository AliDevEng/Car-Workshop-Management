import type {
  BookingRequest,
  BookingRequestStatus,
  RequestedTimeOfDay,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import {
  toIsoDateOrNull,
  toIsoDateTime,
  toIsoDateTimeOrNull,
} from '../../lib/dto-dates.js';

/**
 * Data access for public booking requests (PROJECT_SPEC.md §4.2, §6.2, B5.1).
 *
 * Every function returns a plain DTO, never a Prisma model (§8.2) — and one
 * column never leaves this file at all: `sourceIpHash` is a GDPR mitigation
 * (§5.5), of no use to a client, and exposing it would turn a salted hash into
 * a fingerprint the browser can read. It is absent from the select below, so
 * forgetting to strip it is not a mistake that can be made.
 */

const bookingRequestFields = {
  id: true,
  status: true,
  regNr: true,
  customerName: true,
  phone: true,
  email: true,
  requestedDate: true,
  requestedTimeOfDay: true,
  serviceTypeIds: true,
  message: true,
  submittedAt: true,
  handledByUserId: true,
  handledAt: true,
  rejectionReason: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type BookingRequestRecord = Prisma.BookingRequestGetPayload<{
  select: typeof bookingRequestFields;
}>;

export function toBookingRequestDto(
  record: BookingRequestRecord,
): BookingRequest {
  return {
    id: record.id,
    status: record.status,
    regNr: record.regNr,
    customerName: record.customerName,
    phone: record.phone,
    email: record.email,
    // A `date` column, so `YYYY-MM-DD` rather than an instant: a wished-for
    // day has no time and must not acquire one on the way out (§3.6).
    requestedDate: toIsoDateOrNull(record.requestedDate),
    requestedTimeOfDay: record.requestedTimeOfDay,
    serviceTypeIds: record.serviceTypeIds,
    message: record.message,
    submittedAt: toIsoDateTime(record.submittedAt),
    handledByUserId: record.handledByUserId,
    handledAt: toIsoDateTimeOrNull(record.handledAt),
    rejectionReason: record.rejectionReason,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export type InsertBookingRequestInput = {
  readonly status: BookingRequestStatus;
  readonly regNr: string | null;
  readonly customerName: string;
  readonly phone: string;
  readonly email: string | null;
  readonly requestedDate: Date | null;
  readonly requestedTimeOfDay: RequestedTimeOfDay | null;
  readonly serviceTypeIds: readonly string[];
  readonly message: string | null;
  readonly sourceIpHash: string | null;
};

export function insertBookingRequest(
  db: Database | Prisma.TransactionClient,
  input: InsertBookingRequestInput,
): Promise<BookingRequestRecord> {
  return db.bookingRequest.create({
    data: {
      status: input.status,
      regNr: input.regNr,
      customerName: input.customerName,
      phone: input.phone,
      email: input.email,
      requestedDate: input.requestedDate,
      requestedTimeOfDay: input.requestedTimeOfDay,
      serviceTypeIds: [...input.serviceTypeIds],
      message: input.message,
      sourceIpHash: input.sourceIpHash,
    },
    select: bookingRequestFields,
  });
}

export function findBookingRequestRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<BookingRequestRecord | null> {
  return db.bookingRequest.findUnique({
    where: { id },
    select: bookingRequestFields,
  });
}

export type ListBookingRequestsOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly status?: BookingRequestStatus | undefined;
};

/**
 * Newest first, cursor-paginated on `id DESC`. The id is a UUIDv7 — unique and
 * monotonic by insertion — so one column is a stable cursor and §8.1's
 * composite form is not needed, exactly as for customers and articles.
 * `submittedAt` is the display sort and agrees with `id` for every row the
 * public form writes, but it is not the cursor key.
 */
export async function listBookingRequests(
  db: Database,
  options: ListBookingRequestsOptions,
): Promise<{ data: BookingRequest[]; nextCursor: string | null }> {
  const rows = await db.bookingRequest.findMany({
    where: options.status === undefined ? {} : { status: options.status },
    select: bookingRequestFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toBookingRequestDto), nextCursor };
}

/** The badge in the navigation (§6.2): everything still waiting for a human. */
export function countPendingBookingRequests(db: Database): Promise<number> {
  return db.bookingRequest.count({ where: { status: 'PENDING' } });
}

export const BOOKING_REQUEST_SELECT = bookingRequestFields;
