import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  IDEMPOTENCY_KEY_HEADER,
  apiErrorSchema,
  createServiceProtocolInputSchema,
  cursorQuerySchema,
  idempotencyKeySchema,
  serviceProtocolIdParamsSchema,
  serviceProtocolListQuerySchema,
  serviceProtocolListResponseSchema,
  serviceProtocolResponseSchema,
  updateServiceProtocolInputSchema,
  workOrderIdParamsSchema,
  type ServiceProtocolResponse,
} from 'shared';
import { runIdempotent } from '../../lib/idempotency.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  correctServiceProtocol,
  createServiceProtocol,
  finaliseServiceProtocolInTransaction,
  getServiceProtocol,
  getServiceProtocols,
  getWorkOrderServiceProtocols,
  loadWorkshopDetails,
  updateServiceProtocol,
} from './service.js';

/**
 * Service protocols (PROJECT_SPEC.md §6.7, B8.2, B8.4, B8.5).
 *
 * Every route is `authenticated` rather than `ADMIN`, mirroring `quotes/routes.ts`
 * — §5.3 reserves `ADMIN` for user management, article prices, service rules,
 * partner links and settings, and writing up the job that was just finished is
 * the mechanic's own work.
 *
 * The two work-order-scoped routes live here rather than in the work-order
 * module, because they answer with protocol contracts — the same reasoning
 * that put the quote and work-order-history routes where they are.
 */
const authenticated = { auth: 'authenticated' } as const;

/** The `Idempotency-Key` header (§8.1), read exactly as `quotes/routes.ts` does. */
function idempotencyKey(request: FastifyRequest): string | undefined {
  const raw: unknown = request.headers[IDEMPOTENCY_KEY_HEADER];
  const parsed = idempotencyKeySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function registerServiceProtocolRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/service-protocols',
    {
      config: authenticated,
      schema: {
        querystring: serviceProtocolListQuerySchema,
        response: { 200: serviceProtocolListResponseSchema },
      },
    },
    (request) =>
      getServiceProtocols(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        workOrderId: request.query.workOrderId,
        finalised: request.query.finalised,
      }),
  );

  routes.get(
    '/api/service-protocols/:id',
    {
      config: authenticated,
      schema: {
        params: serviceProtocolIdParamsSchema,
        response: { 200: serviceProtocolResponseSchema, 404: apiErrorSchema },
      },
    },
    async (request) => ({
      protocol: await getServiceProtocol(app.prisma, request.params.id),
    }),
  );

  // --- Work-order-scoped (B8.2, B8.5.3) -------------------------------------

  routes.get(
    '/api/work-orders/:id/service-protocols',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        querystring: cursorQuerySchema,
        response: {
          200: serviceProtocolListResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    (request) =>
      getWorkOrderServiceProtocols(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  routes.post(
    '/api/work-orders/:id/service-protocols',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        body: createServiceProtocolInputSchema,
        response: {
          201: serviceProtocolResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await createServiceProtocol(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  // --- Editing before finalisation (B8.5.1) ---------------------------------

  routes.patch(
    '/api/service-protocols/:id',
    {
      config: authenticated,
      schema: {
        params: serviceProtocolIdParamsSchema,
        body: updateServiceProtocolInputSchema,
        response: {
          200: serviceProtocolResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateServiceProtocol(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  /**
   * Finalising renders the PDF, writes the `Document`, spends the §4.4 number
   * and freezes the protocol — the one mutation in this module that creates a
   * permanent record, so §8.1 gives it the `Idempotency-Key` header, exactly
   * as the quote's `/send` route does and for the same reason.
   */
  routes.post(
    '/api/service-protocols/:id/finalise',
    {
      config: authenticated,
      schema: {
        params: serviceProtocolIdParamsSchema,
        response: {
          200: serviceProtocolResponseSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const actorId = currentUser(request).id;
      const ipHash = clientIpHash(app, request);
      const { id } = request.params;

      const workshop = await loadWorkshopDetails(app.prisma);

      return runIdempotent<ServiceProtocolResponse>(
        app.prisma,
        {
          key: idempotencyKey(request),
          userId: actorId,
          endpoint: `POST /api/service-protocols/${id}/finalise`,
          request: { id },
          statusCode: 200,
          responseSchema: serviceProtocolResponseSchema,
          // §8.3 caps a render at 10 seconds and serialises renders — the
          // same ceiling as the quote send, and for the same reason.
          transaction: { maxWait: 15_000, timeout: 30_000 },
        },
        (tx) =>
          finaliseServiceProtocolInTransaction(tx, actorId, ipHash, id, {
            storageRoot: app.env.STORAGE_PATH,
            workshop,
          }),
      );
    },
  );

  /**
   * A new version of a finalised protocol (B8.4.2, B8.5.2). A `POST` to a
   * sub-resource rather than a `PATCH`, mirroring the quote's `/revise`: it
   * does not change this protocol, it creates another one.
   */
  routes.post(
    '/api/service-protocols/:id/correct',
    {
      config: authenticated,
      schema: {
        params: serviceProtocolIdParamsSchema,
        body: createServiceProtocolInputSchema,
        response: {
          201: serviceProtocolResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const corrected = await correctServiceProtocol(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(corrected);
    },
  );
}
