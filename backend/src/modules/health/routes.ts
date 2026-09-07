import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  healthReadyResponseSchema,
  healthResponseSchema,
  ServiceUnavailableError,
} from 'shared';
import { APP_VERSION } from '../../lib/version.js';

/**
 * Liveness and readiness (PROJECT_SPEC.md §8.5, backend README B0.5.5).
 *
 * Both response schemas come from `shared`, so the frontend's typed client and
 * this handler cannot drift apart.
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/health',
    {
      schema: {
        response: { 200: healthResponseSchema },
      },
    },
    () => ({
      status: 'ok' as const,
      version: APP_VERSION,
      // Seconds, one decimal. Whole milliseconds make every log line differ
      // and add nothing a human reading an uptime figure can use.
      uptime: Math.round(process.uptime() * 10) / 10,
    }),
  );

  routes.get(
    '/api/health/ready',
    {
      schema: {
        response: {
          200: healthReadyResponseSchema,
          503: apiErrorSchema,
        },
      },
    },
    async () => {
      try {
        await app.prisma.$queryRaw`SELECT 1`;
      } catch (cause) {
        throw new ServiceUnavailableError(undefined, { cause });
      }

      return { status: 'ok' as const, database: 'up' as const };
    },
  );
}
