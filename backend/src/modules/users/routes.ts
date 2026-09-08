import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  createUserInputSchema,
  paginatedResponseSchema,
  updateUserInputSchema,
  userIdParamsSchema,
  userListQuerySchema,
  userSchema,
} from 'shared';
import { hashPassword } from '../../lib/password.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import {
  createUser,
  deactivateUser,
  getUser,
  listUsers,
  reactivateUser,
  updateUser,
} from './service.js';

/**
 * Staff account management (PROJECT_SPEC.md §5.3, B2.6).
 *
 * Every route is `ADMIN`-only, declared per route so the guard and the
 * declaration cannot disagree (see plugins/auth.ts).
 */
const adminOnly = { auth: { role: 'ADMIN' } } as const;

const userListResponseSchema = paginatedResponseSchema(userSchema);

export function registerUserRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/users',
    {
      config: adminOnly,
      schema: {
        querystring: userListQuerySchema,
        response: { 200: userListResponseSchema },
      },
    },
    (request) =>
      listUsers(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        isActive: request.query.isActive,
      }),
  );

  routes.get(
    '/api/users/:id',
    {
      config: adminOnly,
      schema: {
        params: userIdParamsSchema,
        response: { 200: userSchema, 404: apiErrorSchema },
      },
    },
    (request) => getUser(app.prisma, request.params.id),
  );

  routes.post(
    '/api/users',
    {
      config: adminOnly,
      schema: {
        body: createUserInputSchema,
        response: { 201: userSchema, 409: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const created = await createUser(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        {
          email: request.body.email,
          name: request.body.name,
          role: request.body.role,
          passwordHash: await hashPassword(request.body.password),
        },
      );

      return reply.status(201).send(created);
    },
  );

  routes.patch(
    '/api/users/:id',
    {
      config: adminOnly,
      schema: {
        params: userIdParamsSchema,
        body: updateUserInputSchema,
        response: {
          200: userSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateUser(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  // Deactivate and reactivate are their own routes rather than an `isActive`
  // field on the patch above: both have preconditions and side effects — the
  // last-admin guard, and destroying that user's sessions — and a rule that
  // important should not be reachable by assigning a boolean (§4.3).
  routes.post(
    '/api/users/:id/deactivate',
    {
      config: adminOnly,
      schema: {
        params: userIdParamsSchema,
        response: {
          200: userSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      deactivateUser(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
      ),
  );

  routes.post(
    '/api/users/:id/reactivate',
    {
      config: adminOnly,
      schema: {
        params: userIdParamsSchema,
        response: { 200: userSchema, 404: apiErrorSchema },
      },
    },
    (request) =>
      reactivateUser(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
      ),
  );
}
