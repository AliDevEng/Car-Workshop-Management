import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  IDEMPOTENCY_KEY_HEADER,
  apiErrorSchema,
  createQuoteInputSchema,
  cursorQuerySchema,
  idempotencyKeySchema,
  quoteDetailSchema,
  quoteIdParamsSchema,
  quoteListQuerySchema,
  quoteListResponseSchema,
  quoteResponseSchema,
  respondToQuoteInputSchema,
  updateQuoteInputSchema,
  workOrderIdParamsSchema,
  type QuoteResponse,
} from 'shared';
import { runIdempotent } from '../../lib/idempotency.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  createQuote,
  getQuote,
  getQuotes,
  getWorkOrderQuotes,
  loadWorkshopDetails,
  respondToQuote,
  reviseQuote,
  sendQuoteInTransaction,
  updateQuote,
} from './service.js';

/**
 * Quotes (PROJECT_SPEC.md §6.6, B7.3, B7.5).
 *
 * Every route is `authenticated` rather than `ADMIN`. §5.3 reserves `ADMIN`
 * for user management, article *prices*, service rules, partner links and
 * settings; quoting a job is the work itself, and a mechanic who cannot put a
 * price in writing without fetching an owner writes it on the back of a job
 * card instead.
 *
 * The two work-order-scoped routes live here, not in the work-order module,
 * because they answer with quote contracts — the same reasoning that put the
 * work-order history routes under vehicle and customer paths in B6.
 */
const authenticated = { auth: 'authenticated' } as const;

/**
 * The `Idempotency-Key` header (§8.1), read as `unknown` and validated.
 *
 * Fastify types headers as `string | string[] | undefined`, and a duplicated
 * header arrives as an array — which would stringify to `a,b` and become a key
 * of its own. An unusable value is treated as *absent* rather than rejected:
 * the header is optional, and refusing the whole request over it would turn a
 * misconfigured proxy into an outage.
 */
function idempotencyKey(request: FastifyRequest): string | undefined {
  const raw: unknown = request.headers[IDEMPOTENCY_KEY_HEADER];
  const parsed = idempotencyKeySchema.safeParse(raw);
  return parsed.success ? parsed.data : undefined;
}

export function registerQuoteRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/quotes',
    {
      config: authenticated,
      schema: {
        querystring: quoteListQuerySchema,
        response: { 200: quoteListResponseSchema },
      },
    },
    (request) =>
      getQuotes(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        status: request.query.status,
        workOrderId: request.query.workOrderId,
      }),
  );

  routes.get(
    '/api/quotes/:id',
    {
      config: authenticated,
      schema: {
        params: quoteIdParamsSchema,
        response: { 200: quoteDetailSchema, 404: apiErrorSchema },
      },
    },
    (request) => getQuote(app.prisma, request.params.id),
  );

  // --- Work-order-scoped (B7.3.2, B7.5.2) -----------------------------------

  routes.get(
    '/api/work-orders/:id/quotes',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        querystring: cursorQuerySchema,
        response: { 200: quoteListResponseSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      getWorkOrderQuotes(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  routes.post(
    '/api/work-orders/:id/quotes',
    {
      config: authenticated,
      schema: {
        params: workOrderIdParamsSchema,
        body: createQuoteInputSchema,
        response: {
          201: quoteResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await createQuote(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  // --- Draft edits (B7.5.1) --------------------------------------------------

  routes.patch(
    '/api/quotes/:id',
    {
      config: authenticated,
      schema: {
        params: quoteIdParamsSchema,
        body: updateQuoteInputSchema,
        response: {
          200: quoteResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateQuote(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  /**
   * Sending renders the PDF, writes the `Document`, spends the §4.4 number and
   * freezes the quote — the one mutation in this module that creates a
   * money-affecting record, so §8.1 gives it the `Idempotency-Key` header.
   *
   * The wrapper owns the transaction, so the document row, the number and the
   * stored replay commit together. Without the key a double-tapped *Skicka*
   * gets a `409` from the state machine, which is correct but tells the user
   * their own retry failed; with it, they get the answer they already earned.
   */
  routes.post(
    '/api/quotes/:id/send',
    {
      config: authenticated,
      schema: {
        params: quoteIdParamsSchema,
        response: {
          200: quoteResponseSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const actorId = currentUser(request).id;
      const ipHash = clientIpHash(app, request);
      const { id } = request.params;

      // Read before the transaction opens: workshop details are configuration
      // rather than part of the atomic unit, and the send already holds its
      // connection for the length of a render.
      const workshop = await loadWorkshopDetails(app.prisma);

      return runIdempotent<QuoteResponse>(
        app.prisma,
        {
          key: idempotencyKey(request),
          userId: actorId,
          endpoint: `POST /api/quotes/${id}/send`,
          request: { id },
          statusCode: 200,
          responseSchema: quoteResponseSchema,
          // The render happens inside this transaction — see
          // `sendQuoteInTransaction` for why it has to. §8.3 caps a render at
          // 10 seconds and serialises renders, so the ceiling has to clear
          // that plus the queue wait, or a healthy send aborts with `P2028`
          // under exactly the load the queue exists to handle. 30 seconds
          // matches the statement timeout already configured on the pool.
          transaction: { maxWait: 15_000, timeout: 30_000 },
        },
        (tx) =>
          sendQuoteInTransaction(tx, actorId, ipHash, id, {
            storageRoot: app.env.STORAGE_PATH,
            workshop,
          }),
      );
    },
  );

  routes.post(
    '/api/quotes/:id/respond',
    {
      config: authenticated,
      schema: {
        params: quoteIdParamsSchema,
        body: respondToQuoteInputSchema,
        response: {
          200: quoteResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      respondToQuote(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  /**
   * A new version of a sent quote (B7.5.1). It is a `POST` to a sub-resource
   * rather than a `PATCH`, because it does not change this quote — it creates
   * another one, and answering `201` with the new quote's id is what tells the
   * client which record it is now looking at.
   */
  routes.post(
    '/api/quotes/:id/revise',
    {
      config: authenticated,
      schema: {
        params: quoteIdParamsSchema,
        body: createQuoteInputSchema,
        response: {
          201: quoteResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const revised = await reviseQuote(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(revised);
    },
  );
}
