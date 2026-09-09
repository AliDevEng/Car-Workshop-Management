import {
  ConflictError,
  FORM_TOKEN_MAX_AGE_SECONDS,
  FORM_TOKEN_MIN_AGE_SECONDS,
  NotFoundError,
  RateLimitError,
  ValidationError,
  isNormalisedRegNr,
  normalisePhone,
  normaliseRegNr,
  type BookingRequest,
  type BookingRequestListResponse,
  type BookingRequestStatus,
  type BookingWithRelations,
  type ConfirmBookingRequestInput,
  type PublicBookingRequestInput,
  type RejectBookingRequestInput,
} from 'shared';
import {
  createAttemptLimiter,
  type AttemptLimiter,
} from '../../lib/attempt-limiter.js';
import { writeAuditLog } from '../../lib/audit.js';
import { verifyFormToken } from '../../lib/form-token.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { createCustomerInTransaction } from '../customers/service.js';
import {
  adoptOwnerlessVehicleInTransaction,
  createVehicleInTransaction,
} from '../vehicles/service.js';
import { assertAssignableUser } from './assignment.js';
import {
  insertBooking,
  toBookingWithRelationsDto,
  withOverlapConflict,
} from './booking.repository.js';
import {
  BOOKING_REQUEST_SELECT,
  countPendingBookingRequests,
  findBookingRequestRecord,
  insertBookingRequest,
  listBookingRequests,
  toBookingRequestDto,
  type BookingRequestRecord,
  type ListBookingRequestsOptions,
} from './request.repository.js';
import { assessBookingRequest } from './spam.js';

/**
 * Booking requests (PROJECT_SPEC.md §4.2, §6.2; B5.1–B5.3).
 *
 * **A public submission creates a request, never a booking.** Everything on
 * the public side of this file is therefore about letting a stranger write one
 * row safely; everything on the staff side is about a human turning that row
 * into a calendar entry.
 */

// --- The public side ---------------------------------------------------------

/** §6.2: 3 submissions per IP per hour, 20 per day globally. */
const SUBMISSIONS_PER_IP = 3;
const SUBMISSIONS_PER_IP_WINDOW_MS = 60 * 60 * 1000;
const SUBMISSIONS_PER_DAY = 20;
const SUBMISSIONS_PER_DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The global bucket has one key by definition; naming it beats `''`. */
const GLOBAL_BUCKET = 'all';

export type BookingRequestLimiters = {
  readonly byIp: AttemptLimiter;
  readonly global: AttemptLimiter;
};

/**
 * In-process and per-instance, matching `createLoginLimiters`. At one
 * container that is the right trade; a shared store becomes worth its
 * complexity when there is a second instance to share it with.
 */
export function createBookingRequestLimiters(): BookingRequestLimiters {
  return {
    byIp: createAttemptLimiter({
      max: SUBMISSIONS_PER_IP,
      windowMs: SUBMISSIONS_PER_IP_WINDOW_MS,
    }),
    global: createAttemptLimiter({
      max: SUBMISSIONS_PER_DAY,
      windowMs: SUBMISSIONS_PER_DAY_WINDOW_MS,
    }),
  };
}

const TOO_MANY_SUBMISSIONS =
  'Vi har tagit emot flera förfrågningar från dig. Ring oss gärna, eller ' +
  'försök igen om en stund.';

/**
 * One message for every way a form token can fail.
 *
 * A stale form and a forged one get the same sentence on purpose: an honest
 * "din tidsstämpel var för ny" tells a bot precisely how long to wait, and the
 * remedy a real visitor needs is the same in all four cases.
 */
const FORM_TOKEN_REJECTED =
  'Formuläret kunde inte verifieras. Ladda om sidan och försök igen.';

/**
 * The slice of Pino this module uses.
 *
 * A service taking a logger is unusual in this codebase, and it is here for a
 * specific reason: this endpoint's whole job is to refuse things **quietly**,
 * and a refusal that is quiet *and* unrecorded leaves an operator unable to
 * tell "the form is broken for everyone" from "a bot found us". The §3.7 error
 * envelope cannot carry the difference — that is exactly what it withholds —
 * and the error handler logs only a code and a status for an expected failure,
 * so a `cause` attached to the thrown error would never be written anywhere.
 *
 * Narrowed to one method so a test can pass a plain object.
 */
export type SubmissionLog = {
  readonly info: (details: Record<string, unknown>, message: string) => void;
};

export type PublicSubmissionContext = {
  readonly formTokenSecret: string;
  readonly limiters: BookingRequestLimiters;
  /** Salted, never the address itself (§5.5). Null when there is no client IP. */
  readonly ipHash: string | null;
  readonly log: SubmissionLog;
};

export type SubmissionOutcome = {
  readonly id: string;
  readonly status: BookingRequestStatus;
};

/**
 * The order of the three gates below is deliberate.
 *
 * The **token is checked first**, before either counter is touched. It is the
 * only free check, and doing it last would let a flood of tokenless requests
 * exhaust a global budget of 20 a day and lock out real customers — turning an
 * anti-spam measure into the outage it exists to prevent.
 *
 * The **IP bucket comes before the global one**, and short-circuits it. A
 * single abusive visitor therefore consumes at most three of the day's twenty,
 * instead of burning the whole workshop's budget on their own.
 */
function assertSubmissionAllowed(
  context: PublicSubmissionContext,
  formToken: string,
): void {
  const verdict = verifyFormToken(
    context.formTokenSecret,
    'booking',
    formToken,
    {
      minAgeSeconds: FORM_TOKEN_MIN_AGE_SECONDS,
      maxAgeSeconds: FORM_TOKEN_MAX_AGE_SECONDS,
    },
  );

  if (verdict !== 'VALID') {
    // The visitor gets one sentence; the log gets which of the four layers
    // caught them. A run of MALFORMED means the form stopped sending a token
    // at all, and that is an outage nobody would otherwise notice.
    context.log.info({ verdict }, 'Booking form token rejected');
    throw new ValidationError(FORM_TOKEN_REJECTED, {
      details: [{ path: 'formToken', message: FORM_TOKEN_REJECTED }],
    });
  }

  if (
    context.ipHash !== null &&
    !context.limiters.byIp.consume(context.ipHash)
  ) {
    throw new RateLimitError(TOO_MANY_SUBMISSIONS);
  }

  if (!context.limiters.global.consume(GLOBAL_BUCKET)) {
    throw new RateLimitError(TOO_MANY_SUBMISSIONS);
  }
}

/**
 * Normalised when it is there at all (B5.1.3). `normaliseRegNr` uppercases and
 * strips separators, which is the form `Vehicle.registrationNumber` is stored
 * in — so confirmation can match the plate exactly rather than guessing at
 * spacing. A value that normalises to nothing is stored as nothing; a
 * personalised plate survives, because §4.2 refuses to block a booking over
 * a plate format.
 */
function normalisedRegNr(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalised = normaliseRegNr(value);
  return normalised === '' ? null : normalised;
}

/** A `date` column takes a `Date` at UTC midnight; the input is `YYYY-MM-DD`. */
function toDateColumn(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

/**
 * Accepts a public submission.
 *
 * Not audited, deliberately. The audit log records what *staff* did (§4.2),
 * and the row this writes is itself the complete record of what an anonymous
 * visitor sent — down to the salted IP. Auditing it would double the volume of
 * every spam wave in the table the workshop relies on to answer questions.
 * The confirmation and the rejection, which are decisions by a person, are
 * audited below.
 */
export async function submitBookingRequest(
  db: Database,
  context: PublicSubmissionContext,
  input: PublicBookingRequestInput,
): Promise<SubmissionOutcome> {
  assertSubmissionAllowed(context, input.formToken);

  const assessment = assessBookingRequest({
    customerName: input.customerName,
    message: input.message,
  });

  const created = await insertBookingRequest(db, {
    // Flagged, never rejected: the three layers above catch machines, and
    // being wrong about what a human wrote costs the workshop a job (§6.2).
    status: assessment.isSpam ? 'SPAM' : 'PENDING',
    regNr: normalisedRegNr(input.regNr),
    customerName: input.customerName,
    phone: input.phone,
    email: input.email ?? null,
    requestedDate:
      input.requestedDate === undefined
        ? null
        : toDateColumn(input.requestedDate),
    requestedTimeOfDay: input.requestedTimeOfDay ?? null,
    serviceTypeIds: input.serviceTypeIds,
    message: input.message ?? null,
    sourceIpHash: context.ipHash,
  });

  if (assessment.isSpam) {
    // Recorded, not answered differently: the visitor is told the same thing
    // either way, because telling a bot which rule caught it is how it learns
    // to get past the next one (B5.2.5).
    context.log.info(
      { bookingRequestId: created.id, reasons: assessment.reasons },
      'Booking request flagged as spam',
    );
  }

  return { id: created.id, status: created.status };
}

// --- The staff inbox ---------------------------------------------------------

export async function listBookingRequestInbox(
  db: Database,
  options: ListBookingRequestsOptions,
): Promise<BookingRequestListResponse> {
  // The count is of everything still PENDING, not of the filtered page: it
  // drives the badge in the navigation, which has to say "there is work" even
  // while the user is looking at the rejected ones (§6.2).
  const [page, unhandledCount] = await Promise.all([
    listBookingRequests(db, options),
    countPendingBookingRequests(db),
  ]);

  return { ...page, unhandledCount };
}

/**
 * The statuses a request can still be acted on from.
 *
 * `SPAM` is included on purpose: the content heuristic is allowed to be wrong,
 * and a genuine customer whose message happened to contain a link must not be
 * unreachable. Once `CONFIRMED` or `REJECTED`, a request is history.
 */
const ACTIONABLE_STATUSES: readonly BookingRequestStatus[] = [
  'PENDING',
  'SPAM',
];

function assertActionable(record: BookingRequestRecord): void {
  if (!ACTIONABLE_STATUSES.includes(record.status)) {
    throw new ConflictError(
      'Förfrågan är redan behandlad och kan inte behandlas igen.',
      { details: { status: record.status } },
    );
  }
}

async function loadActionableRequest(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<BookingRequestRecord> {
  const record = await findBookingRequestRecord(tx, id);
  if (record === null) {
    throw new NotFoundError('Förfrågan kunde inte hittas.');
  }
  assertActionable(record);
  return record;
}

export async function rejectBookingRequest(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: RejectBookingRequestInput,
): Promise<BookingRequest> {
  return db.$transaction(async (tx) => {
    const before = await loadActionableRequest(tx, id);

    const after = await tx.bookingRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        handledByUserId: actorId,
        handledAt: new Date(),
        rejectionReason: input.reason,
      },
      select: BOOKING_REQUEST_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'booking_request.rejected',
      entityType: 'BookingRequest',
      entityId: id,
      before: { status: before.status },
      after: { status: after.status, rejectionReason: after.rejectionReason },
      ipHash,
    });

    return toBookingRequestDto(after);
  });
}

// --- Confirmation ------------------------------------------------------------

/**
 * What a vehicle created from a booking request knows about itself, which is
 * the plate and nothing else.
 *
 * Placeholders rather than a refusal: `make` and `model` are required columns
 * (§4.2), the confirmation dialog does not collect them, and leaving the
 * booking without a vehicle would strand the work order B6 hangs off it. A row
 * that says "unknown" is honest and a human corrects it on the vehicle page —
 * or B10's lookup fills it in.
 */
const UNKNOWN_MAKE = 'Okänt fabrikat';
const UNKNOWN_MODEL = 'Okänd modell';

function fieldError(path: string, message: string): ValidationError {
  return new ValidationError('Uppgifterna kunde inte valideras.', {
    details: [{ path, message }],
  });
}

/**
 * The customer the booking belongs to: the one the staff member picked, the
 * one already on file for this phone number, or a new record.
 *
 * Matching on `phoneNormalised` is what makes a returning customer one row
 * rather than five (§8.2). Deterministically the oldest match, so two owners
 * confirming two requests from the same person do not attach them to different
 * duplicates; inactive customers are skipped, because reactivating someone by
 * accepting a booking is a decision a human should make.
 */
async function resolveCustomer(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  request: BookingRequestRecord,
  chosenId: string | undefined,
): Promise<string> {
  if (chosenId !== undefined) {
    const chosen = await tx.customer.findUnique({
      where: { id: chosenId },
      select: { id: true },
    });
    if (chosen === null) {
      throw fieldError('customerId', 'Kunden kunde inte hittas.');
    }
    return chosen.id;
  }

  const existing = await tx.customer.findFirst({
    where: { phoneNormalised: normalisePhone(request.phone), isActive: true },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (existing !== null) {
    return existing.id;
  }

  const created = await createCustomerInTransaction(tx, actorId, ipHash, {
    type: 'PRIVATE',
    name: request.customerName,
    phone: request.phone,
    ...(request.email === null ? {} : { email: request.email }),
  });
  return created.id;
}

/**
 * The vehicle, if the request named one at all. A plate the workshop has seen
 * before is reused rather than duplicated — the unique index would refuse a
 * second row anyway, and the service history hangs off the existing one (§6.3).
 */
async function resolveVehicle(
  tx: Prisma.TransactionClient,
  actorId: string,
  ipHash: string | null,
  request: BookingRequestRecord,
  chosenId: string | undefined,
  customerId: string,
): Promise<string | null> {
  if (chosenId !== undefined) {
    const chosen = await tx.vehicle.findUnique({
      where: { id: chosenId },
      select: { id: true },
    });
    if (chosen === null) {
      throw fieldError('vehicleId', 'Fordonet kunde inte hittas.');
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

  // A plate a stranger typed is free text, and `Vehicle.registrationNumber`
  // is the column §4.2's unique index lives on: `isNormalisedRegNr` is what
  // `createVehicleInTransaction` would throw over, and a throw here would make
  // the request **permanently unconfirmable** over a typo. So an unusable
  // plate is treated exactly like no plate — the booking is made, the text
  // stays visible on the request, and a human attaches the right car. §4.2 is
  // explicit that a plate must never block a booking.
  if (request.regNr === null || !isNormalisedRegNr(request.regNr)) {
    return null;
  }

  const existing = await tx.vehicle.findUnique({
    where: { registrationNumber: request.regNr },
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
    return existing.id;
  }

  const created = await createVehicleInTransaction(tx, actorId, ipHash, {
    registrationNumber: request.regNr,
    customerId,
    make: UNKNOWN_MAKE,
    model: UNKNOWN_MODEL,
  });
  return created.id;
}

/**
 * Turns a request into a calendar booking: customer, vehicle and booking in
 * **one** transaction (§6.2, B5.3.3).
 *
 * The conflict check is not in this function — it is the `EXCLUDE USING gist`
 * constraint the insert runs into. Reading the calendar first and inserting if
 * it looked free is the race two owners hit on the same morning, and it is the
 * one thing §6.2 is explicit about.
 */
export async function confirmBookingRequest(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: ConfirmBookingRequestInput,
): Promise<BookingWithRelations> {
  // Outside the transaction: a statement that raises 23P01 aborts the whole
  // Postgres transaction, so nothing inside it could run afterwards anyway.
  return withOverlapConflict(() =>
    db.$transaction(async (tx) => {
      const request = await loadActionableRequest(tx, id);

      if (input.assignedUserId !== undefined) {
        await assertAssignableUser(tx, input.assignedUserId);
      }

      const customerId = await resolveCustomer(
        tx,
        actorId,
        ipHash,
        request,
        input.customerId,
      );
      const vehicleId = await resolveVehicle(
        tx,
        actorId,
        ipHash,
        request,
        input.vehicleId,
        customerId,
      );

      const booking = await insertBooking(tx, {
        bookingRequestId: request.id,
        customerId,
        vehicleId,
        startsAt: new Date(input.startsAt),
        endsAt: new Date(input.endsAt),
        assignedUserId: input.assignedUserId ?? null,
        status: 'SCHEDULED',
        note: input.note ?? null,
      });

      await tx.bookingRequest.update({
        where: { id },
        data: {
          status: 'CONFIRMED',
          handledByUserId: actorId,
          handledAt: new Date(),
        },
      });

      await writeAuditLog(tx, {
        userId: actorId,
        action: 'booking_request.confirmed',
        entityType: 'BookingRequest',
        entityId: id,
        before: { status: request.status },
        after: { status: 'CONFIRMED', bookingId: booking.id },
        ipHash,
      });

      await writeAuditLog(tx, {
        userId: actorId,
        action: 'booking.created',
        entityType: 'Booking',
        entityId: booking.id,
        after: {
          bookingRequestId: booking.bookingRequestId,
          customerId: booking.customerId,
          vehicleId: booking.vehicleId,
          startsAt: booking.startsAt,
          endsAt: booking.endsAt,
          assignedUserId: booking.assignedUserId,
          status: booking.status,
        },
        ipHash,
      });

      return toBookingWithRelationsDto(booking);
    }),
  );
}
