import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { searchQueryParamsSchema, searchResponseSchema } from 'shared';
import { search } from './service.js';

/**
 * Global search (PROJECT_SPEC.md §6.3, B3.4).
 *
 * `authenticated`: this is the staff top-bar box. It is not paginated — a
 * jump-to box, not a report — and each category is capped in the service.
 */
export function registerSearchRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/search',
    {
      config: { auth: 'authenticated' },
      schema: {
        querystring: searchQueryParamsSchema,
        response: { 200: searchResponseSchema },
      },
    },
    (request) => search(app.prisma, request.query.q),
  );
}
