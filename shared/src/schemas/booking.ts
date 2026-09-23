import { z } from 'zod';
import { isPositiveInterval, isWithinDayRange } from '../time.js';
import { cursorQuerySchema } from './common.js';
import { customerSummarySchema, customerTypeSchema } from './customer.js';
import {
  emailSchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nameSchema,
  noteSchema,
  optionalIdSchema,
  phoneSchema,
  registrationNumberInputSchema,
  shortTextSchema,
  timestampFields,
} from './primitives.js';
import { userSummarySchema } from './user.js';
import { modelYearSchema, vehicleSummarySchema } from './vehicle.js';

/**
 * Booking requests and calendar bookings — PROJECT_SPEC.md §4.2 and §6.2.
 *
 * **A public submission creates a request, never a booking.** The two owners
 * decide what actually goes in the calendar, which removes the entire class of
 * problems around bay availability and jobs whose real duration is unknown
 * until the car is on the lift.
 */

export const BOOKING_REQUEST_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'REJECTED',
  'SPAM',
] as const;
export type BookingRequestStatus = (typeof BOOKING_REQUEST_STATUSES)[number];

export const BOOKING_REQUEST_STATUS_LABELS: Readonly<
  Record<BookingRequestStatus, string>
> = {
  PENDING: 'Obehandlad',
  CONFIRMED: 'Bekräftad',
  REJECTED: 'Avvisad',
  SPAM: 'Skräppost',
};

export const bookingRequestStatusSchema = z.enum(BOOKING_REQUEST_STATUSES);

export const REQUESTED_TIMES_OF_DAY = ['MORNING', 'AFTERNOON', 'ANY'] as const;
export type RequestedTimeOfDay = (typeof REQUESTED_TIMES_OF_DAY)[number];

export const REQUESTED_TIME_OF_DAY_LABELS: Readonly<
  Record<RequestedTimeOfDay, string>
> = {
  MORNING: 'Förmiddag',
  AFTERNOON: 'Eftermiddag',
  ANY: 'När som helst',
};

export const requestedTimeOfDaySchema = z.enum(REQUESTED_TIMES_OF_DAY);

export const BOOKING_STATUSES = [
  'SCHEDULED',
  'IN_PROGRESS',
  'DONE',
  'CANCELLED',
  'NO_SHOW',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const BOOKING_STATUS_LABELS: Readonly<Record<BookingStatus, string>> = {
  SCHEDULED: 'Inbokad',
  IN_PROGRESS: 'Pågår',
  DONE: 'Klar',
  CANCELLED: 'Avbokad',
  NO_SHOW: 'Uteblev',
};

export const bookingStatusSchema = z.enum(BOOKING_STATUSES);

/**
 * The statuses the booking exclusion constraint ignores (§6.2, B5.4.4). A
 * cancelled booking must not block the slot it no longer occupies, and the
 * partial `WHERE` clause in the migration has to match this list exactly.
 */
export const BOOKING_STATUSES_NOT_OCCUPYING_A_SLOT: readonly BookingStatus[] = [
  'CANCELLED',
  'NO_SHOW',
];

// --- The public form ---------------------------------------------------------

/**
 * `GET /api/public/booking-form-token` (B5.2.2). An HMAC-signed timestamp,
 * issued with the form and required on submission. It is a spending and spam
 * control, not authentication: IP rate limiting alone is defeated by a bot
 * rotating addresses in minutes, and the vehicle lookup behind the same token
 * costs real money (§6.1).
 */
export const formTokenResponseSchema = z.object({
  token: z.string().min(1),
  issuedAt: isoDateTimeSchema,
});
export type FormTokenResponse = z.infer<typeof formTokenResponseSchema>;

export const FORM_TOKEN_MIN_AGE_SECONDS = 3;
export const FORM_TOKEN_MAX_AGE_SECONDS = 2 * 60 * 60;

/**
 * The public submission body. Three of the four anti-spam layers in §6.2 are
 * visible here; the fourth (a content heuristic that flags as `SPAM` rather
 * than rejecting) runs server-side, because telling a bot why it was caught is
 * how it learns.
 */
export const publicBookingRequestInputSchema = z.object({
  /**
   * The honeypot, hidden with CSS. `z.literal('')` rather than a max length:
   * a bot that fills every field it finds is rejected, and a real browser
   * submits the empty string it was rendered with.
   */
  website: z.literal(''),
  formToken: z.string().min(1),
  regNr: registrationNumberInputSchema.optional(),
  customerName: nameSchema,
  phone: phoneSchema,
  email: emailSchema.optional(),
  requestedDate: isoDateSchema.optional(),
  requestedTimeOfDay: requestedTimeOfDaySchema.optional(),
  serviceTypeIds: z.array(idSchema).max(10).default([]),
  message: noteSchema.optional(),
});
export type PublicBookingRequestInput = z.infer<
  typeof publicBookingRequestInputSchema
>;

/**
 * What the public form gets back. Deliberately thin: the request id would let
 * anyone poll someone else's submission, and there is nothing useful for an
 * anonymous visitor to poll for.
 */
export const publicBookingRequestResponseSchema = z.object({
  received: z.literal(true),
});
export type PublicBookingRequestResponse = z.infer<
  typeof publicBookingRequestResponseSchema
>;

// --- The staff inbox ---------------------------------------------------------

export const bookingRequestSchema = z.object({
  id: idSchema,
  status: bookingRequestStatusSchema,
  regNr: z.string().nullable(),
  customerName: nameSchema,
  phone: phoneSchema,
  email: emailSchema.nullable(),
  requestedDate: isoDateSchema.nullable(),
  requestedTimeOfDay: requestedTimeOfDaySchema.nullable(),
  serviceTypeIds: z.array(idSchema),
  message: noteSchema.nullable(),
  submittedAt: isoDateTimeSchema,
  handledByUserId: optionalIdSchema,
  handledAt: isoDateTimeSchema.nullable(),
  rejectionReason: shortTextSchema.nullable(),
  ...timestampFields,
});
export type BookingRequest = z.infer<typeof bookingRequestSchema>;

/**
 * `sourceIpHash` is absent from every response. It is stored as a salted hash
 * for rate limiting (§5.5, B5.1.4) and is of no use to a client; exposing it
 * would turn a GDPR mitigation into a fingerprint the browser can read.
 */
export const bookingRequestListQuerySchema = cursorQuerySchema.extend({
  status: bookingRequestStatusSchema.optional(),
});
export type BookingRequestListQuery = z.infer<
  typeof bookingRequestListQuerySchema
>;

/** The unhandled count drives the badge in the navigation (§6.2). */
export const bookingRequestListResponseSchema = z.object({
  data: z.array(bookingRequestSchema),
  nextCursor: z.string().nullable(),
  unhandledCount: z.number().int().min(0),
});
export type BookingRequestListResponse = z.infer<
  typeof bookingRequestListResponseSchema
>;

export const rejectBookingRequestInputSchema = z.object({
  reason: shortTextSchema,
});
export type RejectBookingRequestInput = z.infer<
  typeof rejectBookingRequestInputSchema
>;

export const bookingRequestIdParamsSchema = z.object({ id: idSchema });
export type BookingRequestIdParams = z.infer<
  typeof bookingRequestIdParamsSchema
>;

/**
 * Confirming creates customer, vehicle and booking in one transaction, reusing
 * existing records matched by phone or registration number (B5.3.3). The staff
 * member may correct anything the customer typed, so the whole record is
 * accepted here rather than only the slot.
 */
export const BOOKING_INTERVAL_MESSAGE =
  'Sluttiden måste ligga efter starttiden.';

export const confirmBookingRequestInputSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    assignedUserId: idSchema.optional(),
    customerId: idSchema.optional(),
    vehicleId: idSchema.optional(),
    note: noteSchema.optional(),
  })
  .refine((input) => isPositiveInterval(input.startsAt, input.endsAt), {
    message: BOOKING_INTERVAL_MESSAGE,
    path: ['endsAt'],
  });
export type ConfirmBookingRequestInput = z.infer<
  typeof confirmBookingRequestInputSchema
>;

// --- A booking taken over the telephone --------------------------------------

/**
 * `POST /api/bookings` — the other way a booking is born.
 *
 * §6.2's "a public submission creates a request, never a booking" is about the
 * *public* form, and it stays true. The commonest case in a two-person
 * workshop is not the form at all: the customer rings, and whoever answers
 * opens the calendar and writes them in. That path had no endpoint, so the
 * only way to get a booking into the calendar was to invent a public request
 * first — which would have put a fabricated row in the inbox the owners use to
 * see what actually came in from the website.
 *
 * What is required here is decided by the columns, not by preference:
 * `Booking.customerId` is `NOT NULL` because the calendar is a promise to a
 * person, and `Customer.phone` is `NOT NULL` because §4.2 makes the telephone
 * the required contact channel. Everything else — the car included — is
 * optional, because a caller who has not read their plate off the key ring yet
 * must still get a time.
 */

/**
 * Either an existing customer or the details to create one.
 *
 * A discriminated union rather than two optional fields: "both given" and
 * "neither given" are then unrepresentable instead of being caught by a
 * `refine` that has to describe them in prose.
 */
export const bookingCustomerInputSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('EXISTING'),
    customerId: idSchema,
  }),
  z.object({
    mode: z.literal('NEW'),
    /**
     * Optional, defaulted to `PRIVATE` by the service rather than here: a
     * `.default()` would make `z.input` and `z.output` disagree, and this
     * schema is shared with the form that produces it.
     */
    type: customerTypeSchema.optional(),
    name: nameSchema,
    phone: phoneSchema,
    email: emailSchema.optional(),
  }),
]);
export type BookingCustomerInput = z.infer<typeof bookingCustomerInputSchema>;

/**
 * The car, which may genuinely be unknown. `NONE` is spelled out rather than
 * left as an absent field so that "no car" is a decision the caller made,
 * visible in the request body and in the test that asserts it.
 *
 * On `NEW`, only the registration number is required — it is the column the
 * unique index lives on, so a vehicle cannot exist without one. `make` and
 * `model` fall back to the same placeholders a confirmed public request
 * already uses, and a human corrects them on the vehicle page.
 */
export const bookingVehicleInputSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('NONE') }),
  z.object({ mode: z.literal('EXISTING'), vehicleId: idSchema }),
  z.object({
    mode: z.literal('NEW'),
    registrationNumber: registrationNumberInputSchema,
    make: nameSchema.optional(),
    model: nameSchema.optional(),
    modelYear: modelYearSchema.optional(),
  }),
]);
export type BookingVehicleInput = z.infer<typeof bookingVehicleInputSchema>;

export const createBookingInputSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    assignedUserId: idSchema.optional(),
    customer: bookingCustomerInputSchema,
    vehicle: bookingVehicleInputSchema,
    note: noteSchema.optional(),
  })
  .refine((input) => isPositiveInterval(input.startsAt, input.endsAt), {
    message: BOOKING_INTERVAL_MESSAGE,
    path: ['endsAt'],
  });
export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;

// --- The calendar ------------------------------------------------------------

export const bookingSchema = z.object({
  id: idSchema,
  bookingRequestId: optionalIdSchema,
  customerId: idSchema,
  vehicleId: optionalIdSchema,
  /**
   * UTC instants. Every boundary the API is *asked* about is interpreted in
   * `Europe/Stockholm` and converted here (§3.6); the containers run UTC on
   * purpose, so the conversion is explicit and testable rather than ambient.
   */
  startsAt: isoDateTimeSchema,
  endsAt: isoDateTimeSchema,
  /**
   * Optional, and the exclusion constraint is partial on it: an unassigned
   * booking occupies nobody's calendar and so cannot conflict (B5.4.4).
   */
  assignedUserId: optionalIdSchema,
  status: bookingStatusSchema,
  note: noteSchema.nullable(),
  ...timestampFields,
});
export type Booking = z.infer<typeof bookingSchema>;

/** What a calendar cell needs, without a second round trip per booking. */
export const bookingWithRelationsSchema = bookingSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema.nullable(),
  assignedUser: userSummarySchema.nullable(),
});
export type BookingWithRelations = z.infer<typeof bookingWithRelationsSchema>;

/** The calendar's maximum window (B5.5.1). A year of bookings is not a view. */
export const CALENDAR_MAX_RANGE_DAYS = 90;

export const calendarQuerySchema = z
  .object({
    from: isoDateTimeSchema,
    to: isoDateTimeSchema,
    userId: idSchema.optional(),
  })
  .refine(
    (query) => isWithinDayRange(query.from, query.to, CALENDAR_MAX_RANGE_DAYS),
    {
      message: `Perioden måste vara i rätt ordning och högst ${String(CALENDAR_MAX_RANGE_DAYS)} dagar lång.`,
      path: ['to'],
    },
  );
export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

/**
 * The calendar is not paginated: the window is already capped at
 * `CALENDAR_MAX_RANGE_DAYS`, and a view that renders half a week is worse than
 * one that refuses an unreasonable range. `from`/`to` echo the window the
 * server actually used, which is **not** always the one that was asked for —
 * the boundaries are widened to whole Europe/Stockholm days (§3.6, B5.5.3), so
 * a client can label its columns from the answer rather than recomputing them.
 */
export const calendarResponseSchema = z.object({
  data: z.array(bookingWithRelationsSchema),
  from: isoDateTimeSchema,
  to: isoDateTimeSchema,
});
export type CalendarResponse = z.infer<typeof calendarResponseSchema>;

/** Reschedule, reassign or change status — `PATCH /api/bookings/:id` (B5.5.2). */
export const updateBookingInputSchema = z
  .object({
    startsAt: isoDateTimeSchema,
    endsAt: isoDateTimeSchema,
    assignedUserId: idSchema.nullable(),
    status: bookingStatusSchema,
    note: noteSchema.nullable(),
  })
  .partial();
export type UpdateBookingInput = z.infer<typeof updateBookingInputSchema>;

export const bookingIdParamsSchema = z.object({ id: idSchema });
export type BookingIdParams = z.infer<typeof bookingIdParamsSchema>;
