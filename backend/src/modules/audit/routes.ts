import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { auditLogListResponseSchema, auditLogQuerySchema } from 'shared';
import { listAuditLog } from './repository.js';

/**
 * `GET /api/audit-log` (PROJECT_SPEC.md §4.2, B11.1.4).
 *
 * `ADMIN`-only: the log carries every customer's contact details and every
 * price change, which is exactly the class of thing §5.3 keeps behind the
 * same restriction as user management and settings. There is deliberately no
 * write route — the log is append-only and is written exclusively by
 * `writeAuditLog`, inside the transaction of the change it describes.
 */
export function registerAuditLogRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/audit-log',
    {
      config: { auth: { role: 'ADMIN' } },
      schema: {
        querystring: auditLogQuerySchema,
        response: { 200: auditLogListResponseSchema },
      },
    },
    (request) =>
      listAuditLog(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        entityType: request.query.entityType,
        entityId: request.query.entityId,
        userId: request.query.userId,
        from: request.query.from,
        to: request.query.to,
      }),
  );
}
