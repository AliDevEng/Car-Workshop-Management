import type {
  FastifyPluginCallback,
  FastifyRequest,
  RouteOptions,
} from 'fastify';
import fp from 'fastify-plugin';
import { ForbiddenError, UnauthorizedError, type UserRole } from 'shared';
import {
  loadSession,
  type AuthenticatedUser,
  type ActiveSession,
} from '../modules/auth/service.js';

/**
 * Authentication and authorisation (PROJECT_SPEC.md §5.1, §5.3; B2.2, B2.4).
 *
 * Two things happen here, and they are deliberately in one place:
 *
 * 1. Every request resolves its session, so `request.user` is either a real
 *    user or `null` — never `any`, and never a lie.
 * 2. Every route **declares** what it requires, and that declaration is what
 *    installs the guard. Declaring `role: 'ADMIN'` and forgetting the
 *    preHandler is not a mistake that can be made, because they are the same
 *    act.
 */

/**
 * `public` — no session needed. `authenticated` — any active staff user.
 * `{ role }` — that role specifically.
 *
 * There is no default. §5.3 says a route with no declaration must fail to
 * register, and a default is exactly what would stop that from happening.
 */
export type RouteAuth =
  'public' | 'authenticated' | { readonly role: UserRole };

declare module 'fastify' {
  interface FastifyContextConfig {
    /** Required on every route. Boot fails without it (B2.4.3). */
    auth?: RouteAuth;
  }

  interface FastifyRequest {
    /** The signed-in user, or `null`. Typed by module augmentation, not `any`. */
    user: AuthenticatedUser | null;
    /** The session backing `user`. Needed by CSRF, which binds to its id. */
    session: ActiveSession | null;
  }
}

/**
 * The user on a route that requires one.
 *
 * A handler could read `request.user` and check for null itself, but it would
 * be checking something the preHandler has already guaranteed — and the
 * tempting way to express that is `request.user!`, which is banned (CLAUDE.md)
 * and would become a 500 the day a route's declaration changes. This throws
 * the same 401 the guard would have.
 */
export function currentUser(request: FastifyRequest): AuthenticatedUser {
  if (request.user === null) {
    throw new UnauthorizedError();
  }
  return request.user;
}

/** The session on a route that requires one. Same reasoning as `currentUser`. */
export function currentSession(request: FastifyRequest): ActiveSession {
  if (request.session === null) {
    throw new UnauthorizedError();
  }
  return request.session;
}

function requireAuth(request: FastifyRequest): void {
  if (request.user === null) {
    throw new UnauthorizedError();
  }
}

function requireRole(request: FastifyRequest, role: UserRole): void {
  const user = currentUser(request);
  if (user.role !== role) {
    throw new ForbiddenError();
  }
}

/**
 * Fastify generates a HEAD route for every GET unless told not to. The
 * generated route carries its own options object, so it is checked separately
 * — and it inherits the GET's config, which is what we want: a HEAD is the
 * same resource and must not become an unguarded back door.
 */
function describeRoute(route: RouteOptions): string {
  const methods = Array.isArray(route.method) ? route.method : [route.method];
  return `${methods.join('|')} ${route.url}`;
}

const authPlugin: FastifyPluginCallback = (app, _options, done) => {
  // Declared on the request rather than assigned per-hook: an undeclared
  // property is a hidden-class deopt in Fastify, and more importantly a
  // request that somehow skips the hook then has `undefined` rather than
  // `null`, which reads as "not checked" instead of "nobody".
  app.decorateRequest('user', null);
  app.decorateRequest('session', null);

  const undeclared: string[] = [];

  app.addHook('onRoute', (route) => {
    const auth = route.config?.auth;

    if (auth === undefined) {
      undeclared.push(describeRoute(route));
      return;
    }

    if (auth === 'public') {
      return;
    }

    const guard =
      auth === 'authenticated'
        ? requireAuth
        : (request: FastifyRequest): void => {
            requireRole(request, auth.role);
          };

    // Prepended, so the guard runs before any preHandler the route added for
    // itself. A route-specific handler must never see an unauthorised request,
    // even to reject it — it may already have read something it should not.
    const existing = route.preHandler;
    const before = existing === undefined ? [] : [existing].flat();
    route.preHandler = [
      (request, _reply, next: (error?: Error) => void) => {
        try {
          guard(request);
          next();
        } catch (error) {
          next(error instanceof Error ? error : new UnauthorizedError());
        }
      },
      ...before,
    ];
  });

  /**
   * The startup assertion (§5.3, B2.4.3). Collected in `onRoute` and thrown
   * here so one failure names every offending route rather than only the first
   * — an important difference when a whole module was written without
   * declarations.
   */
  app.addHook('onReady', (next: (error?: Error) => void) => {
    if (undeclared.length > 0) {
      next(
        new Error(
          'Routes registered without an auth declaration ' +
            '(add `config: { auth: ... }`):\n  ' +
            undeclared.join('\n  '),
        ),
      );
      return;
    }
    next();
  });

  // `onRequest` rather than `preHandler`: the session must be resolved before
  // the CSRF check, which binds its token to the session id.
  app.addHook('onRequest', async (request) => {
    const resolved = await loadSession(app, request);
    request.user = resolved?.user ?? null;
    request.session = resolved?.session ?? null;
  });

  done();
};

export default fp(authPlugin, { name: 'auth' });
