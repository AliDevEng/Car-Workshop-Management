import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  cursorQuerySchema,
  serviceRecommendationIdParamsSchema,
  serviceRecommendationListQuerySchema,
  serviceRecommendationListResponseSchema,
  serviceRecommendationResponseSchema,
  vehicleIdParamsSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  decideServiceRecommendation,
  getServiceRecommendation,
  getServiceRecommendations,
  getVehicleServiceRecommendations,
} from './service.js';

/**
 * Service recommendations (PROJECT_SPEC.md §4.2, §7.3; B9.5–B9.6).
 *
 * `authenticated` throughout: the advice this produces is exactly what a
 * mechanic reviews on the vehicle screen, and accepting or dismissing it is
 * ordinary day-to-day use, not an `ADMIN` action — the rules that *produce*
 * the advice are the `ADMIN` surface (`service-rules/routes.ts`), not the
 * advice itself.
 *
 * The vehicle-scoped route lives here rather than in `vehicles/routes.ts`,
 * mirroring `work-orders/routes.ts`'s history endpoints: it answers with this
 * module's own contract, so the vehicle module does not need to import it.
 */
const authenticated = { auth: 'authenticated' } as const;

export function registerServiceRecommendationRoutes(
  app: FastifyInstance,
): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/service-recommendations',
    {
      config: authenticated,
      schema: {
        querystring: serviceRecommendationListQuerySchema,
        response: { 200: serviceRecommendationListResponseSchema },
      },
    },
    (request) =>
      getServiceRecommendations(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        vehicleId: request.query.vehicleId,
        status: request.query.status,
        severity: request.query.severity,
      }),
  );

  routes.get(
    '/api/service-recommendations/:id',
    {
      config: authenticated,
      schema: {
        params: serviceRecommendationIdParamsSchema,
        response: {
          200: serviceRecommendationResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      recommendation: await getServiceRecommendation(
        app.prisma,
        request.params.id,
      ),
    }),
  );

  routes.get(
    '/api/vehicles/:id/service-recommendations',
    {
      config: authenticated,
      schema: {
        params: vehicleIdParamsSchema,
        querystring: cursorQuerySchema,
        response: {
          200: serviceRecommendationListResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    (request) =>
      getVehicleServiceRecommendations(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  // B9.5.1 — one endpoint per decision, rather than a single `PATCH` taking a
  // status: "accept" and "dismiss" are the two things a mechanic actually
  // does, and the route itself documents that there is no third option.
  routes.post(
    '/api/service-recommendations/:id/accept',
    {
      config: authenticated,
      schema: {
        params: serviceRecommendationIdParamsSchema,
        response: {
          200: serviceRecommendationResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      recommendation: await decideServiceRecommendation(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        { status: 'ACCEPTED' },
      ),
    }),
  );

  routes.post(
    '/api/service-recommendations/:id/dismiss',
    {
      config: authenticated,
      schema: {
        params: serviceRecommendationIdParamsSchema,
        response: {
          200: serviceRecommendationResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      recommendation: await decideServiceRecommendation(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        { status: 'DISMISSED' },
      ),
    }),
  );
}
