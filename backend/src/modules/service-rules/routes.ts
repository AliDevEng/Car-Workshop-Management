import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  createServiceRuleInputSchema,
  importServiceRulesInputSchema,
  serviceRuleImportResponseSchema,
  serviceRuleIdParamsSchema,
  serviceRuleListQuerySchema,
  serviceRuleListResponseSchema,
  serviceRulePreviewInputSchema,
  serviceRulePreviewResponseSchema,
  serviceRuleResponseSchema,
  updateServiceRuleInputSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  createServiceRule,
  getServiceRule,
  getServiceRules,
  importServiceRules,
  previewServiceRule,
  updateServiceRule,
} from './service.js';

/**
 * Service rules (PROJECT_SPEC.md §4.2, §7.3; B9.1, B9.7.3).
 *
 * `ADMIN`-only throughout, including reads: §5.3 names "service rules" beside
 * article prices as an `ADMIN` surface, and unlike checklist templates a
 * mechanic never needs to browse the rule table to do their job — only the
 * *advice* it produces, which is `service-recommendations/routes.ts`.
 */
const adminOnly = { auth: { role: 'ADMIN' } } as const;

export function registerServiceRuleRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/service-rules',
    {
      config: adminOnly,
      schema: {
        querystring: serviceRuleListQuerySchema,
        response: { 200: serviceRuleListResponseSchema },
      },
    },
    (request) =>
      getServiceRules(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        make: request.query.make,
        serviceType: request.query.serviceType,
      }),
  );

  routes.get(
    '/api/service-rules/:id',
    {
      config: adminOnly,
      schema: {
        params: serviceRuleIdParamsSchema,
        response: { 200: serviceRuleResponseSchema, 404: apiErrorSchema },
      },
    },
    async (request) => ({
      rule: await getServiceRule(app.prisma, request.params.id),
    }),
  );

  routes.post(
    '/api/service-rules',
    {
      config: adminOnly,
      schema: {
        body: createServiceRuleInputSchema,
        response: { 201: serviceRuleResponseSchema, 400: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const rule = await createServiceRule(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send({ rule });
    },
  );

  routes.patch(
    '/api/service-rules/:id',
    {
      config: adminOnly,
      schema: {
        params: serviceRuleIdParamsSchema,
        body: updateServiceRuleInputSchema,
        response: {
          200: serviceRuleResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      rule: await updateServiceRule(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
    }),
  );

  // F11.3.4 — "which vehicles would this rule match", checked while the admin
  // is still editing it, before the rule is saved at all.
  routes.post(
    '/api/service-rules/preview',
    {
      config: adminOnly,
      schema: {
        body: serviceRulePreviewInputSchema,
        response: { 200: serviceRulePreviewResponseSchema },
      },
    },
    (request) => previewServiceRule(app.prisma, request.body),
  );

  // F11.3.5 — bulk import with a dry-run preview (B9.7.3, B9.7.4).
  routes.post(
    '/api/service-rules/import',
    {
      config: adminOnly,
      schema: {
        body: importServiceRulesInputSchema,
        response: {
          200: serviceRuleImportResponseSchema,
          400: apiErrorSchema,
        },
      },
    },
    (request) =>
      importServiceRules(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      ),
  );
}
