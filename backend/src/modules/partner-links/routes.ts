import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  createPartnerLinkInputSchema,
  partnerLinkIdParamsSchema,
  partnerLinkListQuerySchema,
  partnerLinkListResponseSchema,
  partnerLinkResponseSchema,
  reorderPartnerLinksInputSchema,
  updatePartnerLinkInputSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  createPartnerLink,
  getPartnerLink,
  getPartnerLinks,
  reorderPartnerLinks,
  updatePartnerLink,
} from './service.js';

/**
 * Partner deep links (PROJECT_SPEC.md §4.2, §7.2; B10.6).
 *
 * Reads are `authenticated` — a mechanic renders these as buttons on the
 * vehicle and article pages, the same split checklist templates draw between
 * a mechanic who browses and an `ADMIN` who edits. Writes, including
 * reordering, are `ADMIN`-only (§5.3's "workshop policy" class).
 */
const authenticated = { auth: 'authenticated' } as const;
const adminOnly = { auth: { role: 'ADMIN' } } as const;

export function registerPartnerLinkRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/partner-links',
    {
      config: authenticated,
      schema: {
        querystring: partnerLinkListQuerySchema,
        response: { 200: partnerLinkListResponseSchema },
      },
    },
    async (request) => ({
      data: await getPartnerLinks(app.prisma, {
        isActive: request.query.isActive,
      }),
    }),
  );

  routes.get(
    '/api/partner-links/:id',
    {
      config: authenticated,
      schema: {
        params: partnerLinkIdParamsSchema,
        response: { 200: partnerLinkResponseSchema, 404: apiErrorSchema },
      },
    },
    async (request) => ({
      link: await getPartnerLink(app.prisma, request.params.id),
    }),
  );

  routes.post(
    '/api/partner-links',
    {
      config: adminOnly,
      schema: {
        body: createPartnerLinkInputSchema,
        response: { 201: partnerLinkResponseSchema, 400: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const link = await createPartnerLink(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send({ link });
    },
  );

  routes.patch(
    '/api/partner-links/:id',
    {
      config: adminOnly,
      schema: {
        params: partnerLinkIdParamsSchema,
        body: updatePartnerLinkInputSchema,
        response: {
          200: partnerLinkResponseSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      link: await updatePartnerLink(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
    }),
  );

  routes.post(
    '/api/partner-links/reorder',
    {
      config: adminOnly,
      schema: {
        body: reorderPartnerLinksInputSchema,
        response: {
          200: partnerLinkListResponseSchema,
          400: apiErrorSchema,
        },
      },
    },
    async (request) => ({
      data: await reorderPartnerLinks(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body.orderedIds,
      ),
    }),
  );
}
