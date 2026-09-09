import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  bookingIdParamsSchema,
  bookingRequestIdParamsSchema,
  bookingRequestListQuerySchema,
  bookingRequestListResponseSchema,
  bookingRequestSchema,
  bookingWithRelationsSchema,
  calendarQuerySchema,
  calendarResponseSchema,
  confirmBookingRequestInputSchema,
  formTokenResponseSchema,
  publicBookingRequestInputSchema,
  publicBookingRequestResponseSchema,
  rejectBookingRequestInputSchema,
  updateBookingInputSchema,
} from 'shared';
import { issueFormToken } from '../../lib/form-token.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import { getCalendar, updateBooking } from './booking.service.js';
import {
  confirmBookingRequest,
  createBookingRequestLimiters,
  listBookingRequestInbox,
  rejectBookingRequest,
  submitBookingRequest,
} from './request.service.js';

/**
 * Booking requests and the calendar (PROJECT_SPEC.md §6.2, B5).
 *
 * Two public routes and four staff ones. The public pair is the only part of
 * the API an anonymous visitor can reach besides the workshop's own details,
 * and `POST /api/public/booking-requests` is the single CSRF-exempt route in
 * the system (§5.2) — it has no session to bind a token to, and §6.2's four
 * layers protect it instead.
 */
const publicRoute = { auth: 'public' } as const;
const authenticated = { auth: 'authenticated' } as const;

export function registerBookingRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const limiters = createBookingRequestLimiters();

  routes.get(
    '/api/public/booking-form-token',
    {
      config: publicRoute,
      schema: { response: { 200: formTokenResponseSchema } },
    },
    () => {
      const issued = issueFormToken(app.env.FORM_TOKEN_SECRET, 'booking');
      return { token: issued.token, issuedAt: issued.issuedAt.toISOString() };
    },
  );

  routes.post(
    '/api/public/booking-requests',
    {
      config: publicRoute,
      schema: {
        body: publicBookingRequestInputSchema,
        response: {
          201: publicBookingRequestResponseSchema,
          400: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await submitBookingRequest(
        app.prisma,
        {
          formTokenSecret: app.env.FORM_TOKEN_SECRET,
          limiters,
          ipHash: clientIpHash(app, request),
          // Carries the request id, so a spam wave or a broken form token can
          // be correlated with the rest of the request's log lines.
          log: request.log,
        },
        request.body,
      );

      // Deliberately thin, and identical for a flagged submission: the request
      // id would let anyone poll someone else's booking, and an answer that
      // varied would tell a bot which layer caught it.
      return reply.status(201).send({ received: true });
    },
  );

  routes.get(
    '/api/booking-requests',
    {
      config: authenticated,
      schema: {
        querystring: bookingRequestListQuerySchema,
        response: { 200: bookingRequestListResponseSchema },
      },
    },
    (request) =>
      listBookingRequestInbox(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        status: request.query.status,
      }),
  );

  routes.post(
    '/api/booking-requests/:id/reject',
    {
      config: authenticated,
      schema: {
        params: bookingRequestIdParamsSchema,
        body: rejectBookingRequestInputSchema,
        response: {
          200: bookingRequestSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      rejectBookingRequest(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  routes.post(
    '/api/booking-requests/:id/confirm',
    {
      config: authenticated,
      schema: {
        params: bookingRequestIdParamsSchema,
        body: confirmBookingRequestInputSchema,
        response: {
          201: bookingWithRelationsSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const booking = await confirmBookingRequest(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(booking);
    },
  );

  routes.get(
    '/api/bookings',
    {
      config: authenticated,
      schema: {
        querystring: calendarQuerySchema,
        response: { 200: calendarResponseSchema, 400: apiErrorSchema },
      },
    },
    (request) => getCalendar(app.prisma, request.query),
  );

  routes.patch(
    '/api/bookings/:id',
    {
      config: authenticated,
      schema: {
        params: bookingIdParamsSchema,
        body: updateBookingInputSchema,
        response: {
          200: bookingWithRelationsSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateBooking(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );
}
