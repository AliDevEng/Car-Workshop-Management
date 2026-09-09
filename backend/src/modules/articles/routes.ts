import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  articleIdParamsSchema,
  articleListQuerySchema,
  articleSchema,
  createArticleInputSchema,
  lowStockReportSchema,
  paginatedResponseSchema,
  stockAdjustmentInputSchema,
  stockMovementListQuerySchema,
  stockMovementResultSchema,
  stockMovementWithUserSchema,
  stocktakeInputSchema,
  stocktakeResultSchema,
  updateArticleInputSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import { listArticles } from './repository.js';
import {
  createArticle,
  deactivateArticle,
  getArticle,
  getLowStockArticles,
  reactivateArticle,
  updateArticle,
} from './service.js';
import { toLowStockCsv } from './low-stock-csv.js';
import {
  adjustStock,
  getStockMovements,
  recordStocktake,
} from './stock.service.js';

/**
 * The article catalogue and stock ledger (PROJECT_SPEC.md §4.2, §6.4, B4).
 *
 * Reads are `authenticated`. §5.3 makes "price changes on articles" and "stock
 * adjustments other than consumption" `ADMIN`-only: creating an article
 * (which sets a price) and stocktake/adjustment are `ADMIN` routes, while a
 * `PATCH` is `authenticated` and the service refuses a price change from a
 * non-admin — so a mechanic can still fix a name or a shelf location.
 */
const authenticated = { auth: 'authenticated' } as const;
const adminOnly = { auth: { role: 'ADMIN' } } as const;

const articleListResponseSchema = paginatedResponseSchema(articleSchema);
const movementListResponseSchema = paginatedResponseSchema(
  stockMovementWithUserSchema,
);

export function registerArticleRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/articles',
    {
      config: authenticated,
      schema: {
        querystring: articleListQuerySchema,
        response: { 200: articleListResponseSchema },
      },
    },
    (request) =>
      listArticles(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        q: request.query.q,
        lowStock: request.query.lowStock,
        isActive: request.query.isActive,
      }),
  );

  // Static paths, registered before `/api/articles/:id` for clarity — Fastify
  // gives a static route priority over a parametric one regardless of order.
  routes.get(
    '/api/articles/low-stock',
    {
      config: authenticated,
      schema: { response: { 200: lowStockReportSchema } },
    },
    async () => ({ data: await getLowStockArticles(app.prisma) }),
  );

  routes.get(
    '/api/articles/low-stock/export',
    { config: authenticated },
    async (_request, reply) => {
      const rows = await getLowStockArticles(app.prisma);
      const today = new Date().toISOString().slice(0, 10);
      return reply
        .type('text/csv; charset=utf-8')
        .header(
          'content-disposition',
          `attachment; filename="lager-underskott-${today}.csv"`,
        )
        .send(toLowStockCsv(rows));
    },
  );

  routes.get(
    '/api/articles/:id',
    {
      config: authenticated,
      schema: {
        params: articleIdParamsSchema,
        response: { 200: articleSchema, 404: apiErrorSchema },
      },
    },
    (request) => getArticle(app.prisma, request.params.id),
  );

  routes.get(
    '/api/articles/:id/movements',
    {
      config: authenticated,
      schema: {
        params: articleIdParamsSchema,
        querystring: stockMovementListQuerySchema,
        response: { 200: movementListResponseSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      getStockMovements(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        type: request.query.type,
      }),
  );

  routes.post(
    '/api/articles',
    {
      config: adminOnly,
      schema: {
        body: createArticleInputSchema,
        response: { 201: articleSchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const created = await createArticle(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  routes.patch(
    '/api/articles/:id',
    {
      config: authenticated,
      schema: {
        params: articleIdParamsSchema,
        body: updateArticleInputSchema,
        response: {
          200: articleSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) => {
      const user = currentUser(request);
      return updateArticle(
        app.prisma,
        { id: user.id, role: user.role },
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
    },
  );

  routes.post(
    '/api/articles/:id/deactivate',
    {
      config: authenticated,
      schema: {
        params: articleIdParamsSchema,
        response: { 200: articleSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      deactivateArticle(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
      ),
  );

  routes.post(
    '/api/articles/:id/reactivate',
    {
      config: authenticated,
      schema: {
        params: articleIdParamsSchema,
        response: { 200: articleSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      reactivateArticle(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
      ),
  );

  // Stock movements — `ADMIN` (§5.3: "stock adjustments other than
  // consumption"). Consumption is deducted by work-order completion in B6.
  routes.post(
    '/api/articles/:id/stocktake',
    {
      config: adminOnly,
      schema: {
        params: articleIdParamsSchema,
        body: stocktakeInputSchema,
        response: {
          201: stocktakeResultSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await recordStocktake(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(result);
    },
  );

  routes.post(
    '/api/articles/:id/stock-adjustments',
    {
      config: adminOnly,
      schema: {
        params: articleIdParamsSchema,
        body: stockAdjustmentInputSchema,
        response: {
          201: stockMovementResultSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await adjustStock(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      );
      return reply.status(201).send(result);
    },
  );
}
