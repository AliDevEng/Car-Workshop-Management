import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  IDEMPOTENCY_KEY_HEADER,
  apiErrorSchema,
  changeWorkOrderStatusInputSchema,
  createWorkOrderInputSchema,
  createWorkOrderLineInputSchema,
  customerIdParamsSchema,
  cursorQuerySchema,
  idempotencyKeySchema,
  reorderWorkOrderLinesInputSchema,
  updateWorkOrderInputSchema,
  updateWorkOrderLineInputSchema,
  vehicleIdParamsSchema,
  workOrderDetailSchema,
  workOrderHistoryResponseSchema,
  workOrderIdParamsSchema,
  workOrderLineParamsSchema,
  workOrderListQuerySchema,
  workOrderListResponseSchema,
  workOrderResponseSchema,
  type ChangeWorkOrderStatusInput,
  type WorkOrderResponse,
} from 'shared';
import { runIdempotent } from '../../lib/idempotency.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  addWorkOrderLine,
  deleteWorkOrderLine,
  reorderWorkOrderLines,
  updateWorkOrderLine,
} from './line.service.js';
import { listCustomerHistory, listVehicleHistory } from './history.service.js';
import {
  createWorkOrder,
  getWorkOrder,
  getWorkOrders,
  updateWorkOrder,
} from './service.js';
import { changeStatusInTransaction } from './status.service.js';

/**
 * Work orders (PROJECT_SPEC.md §6.5, B6).
 *
 * Every route is `authenticated` rather than `ADMIN`. §5.3 reserves `ADMIN`
 * for user management, article *prices*, service rules, partner links,
 * settings and "stock adjustments other than consumption" — and this module's
 * stock movements are precisely consumption. A mechanic who cannot finish a
 * job without fetching an owner is a mechanic who writes the job on paper.
 *
 * The two history routes live here, under vehicle and customer paths, because
 * they answer with work-order contracts. Putting them in those modules would
 * have made the vehicle module import work-order internals to build a shape it
 * does not own.
 */
const authenticated = { auth: 'authenticated' } as const;

/**
 * The `Idempotency-Key` header (§8.1), read as `unknown` and validated.
 *
 * Fastify types headers as `string | string[] | undefined`, and a duplicated
 * header arrives as an array — which would stringify to `a,b` and become a key
 * of its own. An unusable value is treated as *absent* rather than rejected:
 * the header is optional, and refusing the whole request over it would turn a
 * misconfigured proxy into an outage on the one endpoint that must work.
 */
function idempotencyKey(request: FastifyRequest): string | undefined {
  const raw: unknown = request.headers[IDEMPOTENCY_KEY_HEADER];
  const parsed = idempotencyKeySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function registerWorkOrderRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/work-orders',
    {
      config: authenticated,
      schema: {
        querystring: workOrderListQuerySchema,
        response: { 200: workOrderListResponseSchema },
      },
    },
    (request) =>
      getWorkOrders(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        status: request.query.status,
        vehicleId: request.query.vehicleId,
        customerId: request.query.customerId,
        assignedUserId: request.query.assignedUserId,
        bookingId: request.query.bookingId,
      }),
  );

  routes.post(
    '/api/work-orders',
    {
      config: authenticated,
      schema: {
        body: createWorkOrderInputSchema,
        response: {
          201: workOrderResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await createWorkOrder(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  routes.get(
    '/api/work-orders/:id',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        response: { 200: workOrderDetailSchema, 404: apiErrorSchema },
      },
    },
    (request) => getWorkOrder(app.prisma, request.params.id),
  );

  routes.patch(
    '/api/work-orders/:id',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        body: updateWorkOrderInputSchema,
        response: {
          200: workOrderResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateWorkOrder(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  /**
   * A status change is the one mutation in this module that moves money-
   * and stock-affecting records, so §8.1 gives it the `Idempotency-Key`
   * header. The wrapper owns the transaction, so the stock movements and the
   * stored replay commit together (B6.6.3).
   */
  routes.post(
    '/api/work-orders/:id/status',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        body: changeWorkOrderStatusInputSchema,
        response: {
          200: workOrderResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) => {
      const actorId = currentUser(request).id;
      const ipHash = clientIpHash(app, request);
      const { id } = request.params;
      const input: ChangeWorkOrderStatusInput = request.body;

      return runIdempotent<WorkOrderResponse>(
        app.prisma,
        {
          key: idempotencyKey(request),
          userId: actorId,
          endpoint: `POST /api/work-orders/${id}/status`,
          request: input,
          statusCode: 200,
          responseSchema: workOrderResponseSchema,
        },
        (tx) => changeStatusInTransaction(tx, actorId, ipHash, id, input),
      );
    },
  );

  // --- Lines -----------------------------------------------------------------
  //
  // Every line mutation answers with the whole order, its lines and its
  // recomputed totals. §6.5 has the client refetching after each one anyway,
  // because lines are deliberately not version-checked; returning the result
  // makes that one round trip instead of two, and removes the window in which
  // the screen shows a total that no longer matches its own lines.

  routes.post(
    '/api/work-orders/:id/lines',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        body: createWorkOrderLineInputSchema,
        response: {
          201: workOrderResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await addWorkOrderLine(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(result);
    },
  );

  routes.patch(
    '/api/work-orders/:id/lines/:lineId',
    {
      config: authenticated,
      schema: {
        params: workOrderLineParamsSchema,
        body: updateWorkOrderLineInputSchema,
        response: {
          200: workOrderResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateWorkOrderLine(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.params.lineId,
        request.body,
      ),
  );

  routes.delete(
    '/api/work-orders/:id/lines/:lineId',
    {
      config: authenticated,
      schema: {
        params: workOrderLineParamsSchema,
        response: {
          200: workOrderResponseSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      deleteWorkOrderLine(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.params.lineId,
      ),
  );

  routes.post(
    '/api/work-orders/:id/lines/reorder',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        body: reorderWorkOrderLinesInputSchema,
        response: {
          200: workOrderResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      reorderWorkOrderLines(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  // --- History (B6.8.1) ------------------------------------------------------

  routes.get(
    '/api/vehicles/:id/work-orders',
    {
      config: authenticated,
      schema: {
        params: vehicleIdParamsSchema,
        querystring: cursorQuerySchema,
        response: {
          200: workOrderHistoryResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    (request) =>
      listVehicleHistory(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  routes.get(
    '/api/customers/:id/work-orders',
    {
      config: authenticated,
      schema: {
        params: customerIdParamsSchema,
        querystring: cursorQuerySchema,
        response: {
          200: workOrderHistoryResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    (request) =>
      listCustomerHistory(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );
}
