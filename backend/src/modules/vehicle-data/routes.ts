import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  RateLimitError,
  ValidationError,
  VEHICLE_LOOKUP_TOKEN_MAX_AGE_SECONDS,
  VEHICLE_LOOKUP_TOKEN_MIN_AGE_SECONDS,
  apiErrorSchema,
  formTokenResponseSchema,
  vehicleDetailSchema,
  vehicleIdParamsSchema,
  vehicleLookupInputSchema,
  vehicleLookupResponseSchema,
} from 'shared';
import { createAttemptLimiter } from '../../lib/attempt-limiter.js';
import { issueFormToken, verifyFormToken } from '../../lib/form-token.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  createVehicleDataRuntime,
  lookupVehicleDataPublic,
  refreshVehicleData,
} from './service.js';

/**
 * Vehicle-data lookup (PROJECT_SPEC.md §6.1, §7.1; B10.1–B10.4).
 */
const publicRoute = { auth: 'public' } as const;
const adminOnly = { auth: { role: 'ADMIN' } } as const;

/** §6.1: 5 lookups per IP per hour. */
const PUBLIC_LOOKUPS_PER_IP = 5;
const PUBLIC_LOOKUPS_PER_IP_WINDOW_MS = 60 * 60 * 1000;

/**
 * §7.1's "itself rate-limited" for the staff refresh button — separate from,
 * and tighter than, the daily provider-spend ceiling in `Setting`. This one
 * guards against a stuck tablet hammering the button, not against cost.
 */
const STAFF_REFRESHES_PER_USER = 10;
const STAFF_REFRESHES_PER_USER_WINDOW_MS = 60 * 60 * 1000;

const TOO_MANY_LOOKUPS =
  'Vi har tagit emot flera uppslag från dig. Försök igen om en stund.';
const FORM_TOKEN_REJECTED =
  'Formuläret kunde inte verifieras. Ladda om sidan och försök igen.';

export function registerVehicleDataRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const runtime = createVehicleDataRuntime(app.env);
  const publicIpLimiter = createAttemptLimiter({
    max: PUBLIC_LOOKUPS_PER_IP,
    windowMs: PUBLIC_LOOKUPS_PER_IP_WINDOW_MS,
  });
  const staffRefreshLimiter = createAttemptLimiter({
    max: STAFF_REFRESHES_PER_USER,
    windowMs: STAFF_REFRESHES_PER_USER_WINDOW_MS,
  });

  routes.get(
    '/api/public/vehicle-lookup-form-token',
    {
      config: publicRoute,
      schema: { response: { 200: formTokenResponseSchema } },
    },
    () => {
      const issued = issueFormToken(
        app.env.FORM_TOKEN_SECRET,
        'vehicle-lookup',
      );
      return { token: issued.token, issuedAt: issued.issuedAt.toISOString() };
    },
  );

  routes.post(
    '/api/public/vehicle-lookup',
    {
      config: publicRoute,
      schema: {
        body: vehicleLookupInputSchema,
        response: {
          200: vehicleLookupResponseSchema,
          400: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const verdict = verifyFormToken(
        app.env.FORM_TOKEN_SECRET,
        'vehicle-lookup',
        request.body.formToken,
        {
          minAgeSeconds: VEHICLE_LOOKUP_TOKEN_MIN_AGE_SECONDS,
          maxAgeSeconds: VEHICLE_LOOKUP_TOKEN_MAX_AGE_SECONDS,
        },
      );
      if (verdict !== 'VALID') {
        request.log.info({ verdict }, 'Vehicle lookup form token rejected');
        throw new ValidationError(FORM_TOKEN_REJECTED, {
          details: [{ path: 'formToken', message: FORM_TOKEN_REJECTED }],
        });
      }

      const ipHash = clientIpHash(app, request);
      if (ipHash !== null && !publicIpLimiter.consume(ipHash)) {
        throw new RateLimitError(TOO_MANY_LOOKUPS);
      }

      return lookupVehicleDataPublic(
        app.prisma,
        runtime,
        request.body.registrationNumber,
        ipHash,
      );
    },
  );

  routes.post(
    '/api/vehicles/:id/vehicle-data/refresh',
    {
      config: adminOnly,
      schema: {
        params: vehicleIdParamsSchema,
        response: {
          200: vehicleDetailSchema,
          404: apiErrorSchema,
          429: apiErrorSchema,
          503: apiErrorSchema,
        },
      },
    },
    (request) => {
      const user = currentUser(request);
      if (!staffRefreshLimiter.consume(user.id)) {
        throw new RateLimitError(TOO_MANY_LOOKUPS);
      }

      return refreshVehicleData(
        app.prisma,
        runtime,
        user.id,
        clientIpHash(app, request),
        request.params.id,
      );
    },
  );
}
