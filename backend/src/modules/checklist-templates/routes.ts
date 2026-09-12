import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  checklistTemplateIdParamsSchema,
  checklistTemplateListQuerySchema,
  checklistTemplateListResponseSchema,
  checklistTemplateResponseSchema,
  createChecklistTemplateInputSchema,
  updateChecklistTemplateInputSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  createChecklistTemplate,
  getChecklistTemplate,
  getChecklistTemplates,
  updateChecklistTemplate,
} from './service.js';

/**
 * Checklist templates (PROJECT_SPEC.md §4.2, §6.7; B8.1).
 *
 * Reads are `authenticated` — a mechanic creating a protocol needs to see the
 * available templates. Writes are `ADMIN`, the same split §5.3 draws for
 * article prices and service rules: the questions a protocol asks are a
 * workshop policy, not something a mechanic edits mid-job.
 */
const authenticated = { auth: 'authenticated' } as const;
const adminOnly = { auth: { role: 'ADMIN' } } as const;

export function registerChecklistTemplateRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/checklist-templates',
    {
      config: authenticated,
      schema: {
        querystring: checklistTemplateListQuerySchema,
        response: { 200: checklistTemplateListResponseSchema },
      },
    },
    (request) =>
      getChecklistTemplates(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        serviceType: request.query.serviceType,
        isActive: request.query.isActive,
      }),
  );

  routes.get(
    '/api/checklist-templates/:id',
    {
      config: authenticated,
      schema: {
        params: checklistTemplateIdParamsSchema,
        response: {
          200: checklistTemplateResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      template: await getChecklistTemplate(app.prisma, request.params.id),
    }),
  );

  routes.post(
    '/api/checklist-templates',
    {
      config: adminOnly,
      schema: {
        body: createChecklistTemplateInputSchema,
        response: {
          201: checklistTemplateResponseSchema,
          400: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const template = await createChecklistTemplate(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send({ template });
    },
  );

  routes.patch(
    '/api/checklist-templates/:id',
    {
      config: adminOnly,
      schema: {
        params: checklistTemplateIdParamsSchema,
        body: updateChecklistTemplateInputSchema,
        response: {
          200: checklistTemplateResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      template: await updateChecklistTemplate(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
    }),
  );
}
