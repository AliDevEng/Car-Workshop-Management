import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { apiErrorSchema, dashboardQuerySchema, dashboardSchema } from 'shared';
import { getDashboard } from './service.js';

/**
 * The dashboard (PROJECT_SPEC.md §6.8, B6.8.2).
 *
 * Read-only and `authenticated`: it is what the two owners see first, and
 * every number on it is one they could reach through a list they already have
 * permission for.
 */
const authenticated = { auth: 'authenticated' } as const;

export function registerDashboardRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/dashboard',
    {
      config: authenticated,
      schema: {
        querystring: dashboardQuerySchema,
        response: { 200: dashboardSchema, 400: apiErrorSchema },
      },
    },
    (request) => getDashboard(app.prisma, request.query),
  );
}
