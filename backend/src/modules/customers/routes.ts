import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  createCustomerInputSchema,
  customerDetailSchema,
  customerIdParamsSchema,
  customerListQuerySchema,
  customerSchema,
  paginatedResponseSchema,
  updateCustomerInputSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import { listCustomers } from './repository.js';
import {
  createCustomer,
  deactivateCustomer,
  getCustomerDetail,
  reactivateCustomer,
  updateCustomer,
} from './service.js';

/**
 * Customers (PROJECT_SPEC.md §4.2, §6.3, B3.1).
 *
 * `authenticated` throughout: both owners do mechanical work and both manage
 * customers. Price lists and settings are the `ADMIN`-only surface (§5.3), not
 * the customer register.
 */
const authenticated = { auth: 'authenticated' } as const;

const customerListResponseSchema = paginatedResponseSchema(customerSchema);

export function registerCustomerRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/customers',
    {
      config: authenticated,
      schema: {
        querystring: customerListQuerySchema,
        response: { 200: customerListResponseSchema },
      },
    },
    (request) =>
      listCustomers(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        q: request.query.q,
        isActive: request.query.isActive,
      }),
  );

  routes.get(
    '/api/customers/:id',
    {
      config: authenticated,
      schema: {
        params: customerIdParamsSchema,
        response: { 200: customerDetailSchema, 404: apiErrorSchema },
      },
    },
    (request) => getCustomerDetail(app.prisma, request.params.id),
  );

  routes.post(
    '/api/customers',
    {
      config: authenticated,
      schema: {
        body: createCustomerInputSchema,
        response: { 201: customerSchema },
      },
    },
    async (request, reply) => {
      const created = await createCustomer(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  routes.patch(
    '/api/customers/:id',
    {
      config: authenticated,
      schema: {
        params: customerIdParamsSchema,
        body: updateCustomerInputSchema,
        response: { 200: customerSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      updateCustomer(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  routes.post(
    '/api/customers/:id/deactivate',
    {
      config: authenticated,
      schema: {
        params: customerIdParamsSchema,
        response: { 200: customerSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      deactivateCustomer(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
      ),
  );

  routes.post(
    '/api/customers/:id/reactivate',
    {
      config: authenticated,
      schema: {
        params: customerIdParamsSchema,
        response: { 200: customerSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      reactivateCustomer(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
      ),
  );
}
