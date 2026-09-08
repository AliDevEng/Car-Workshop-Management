import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  changePasswordInputSchema,
  csrfTokenResponseSchema,
  currentUserSchema,
  loginInputSchema,
  RateLimitError,
  UnauthorizedError,
} from 'shared';
import { z } from 'zod';
import {
  createAttemptLimiter,
  type AttemptLimiter,
} from '../../lib/attempt-limiter.js';
import { hashPassword, verifyPassword } from '../../lib/password.js';
import { currentSession, currentUser } from '../../plugins/auth.js';
import { currentCsrfToken, issueCsrfCookie } from '../../plugins/csrf.js';
import { deleteSession, findUserById, toUserDto } from './repository.js';
import {
  authenticate,
  changePassword,
  clearSessionCookie,
  clientIpHash,
  setSessionCookie,
} from './service.js';

/**
 * Login, logout, the current user and a password change
 * (PROJECT_SPEC.md §5.1, §5.2; B2.3, B2.6.2).
 */

/** 5 attempts per 15 minutes, on the email **and** on the IP (§5.1, B2.3.2). */
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export type LoginLimiters = {
  readonly byEmail: AttemptLimiter;
  readonly byIp: AttemptLimiter;
};

export function createLoginLimiters(): LoginLimiters {
  const options = { max: LOGIN_MAX_ATTEMPTS, windowMs: LOGIN_WINDOW_MS };
  return {
    byEmail: createAttemptLimiter(options),
    byIp: createAttemptLimiter(options),
  };
}

const TOO_MANY_ATTEMPTS =
  'För många inloggningsförsök. Vänta en stund och försök igen.';

/**
 * Both buckets are consumed on every attempt, deliberately without
 * short-circuiting. Stopping at the first failure would leave the second
 * counter untouched, so an attacker spreading attempts across addresses would
 * never exhaust the email bucket — and that is the bucket protecting the
 * account rather than the network.
 */
export function consumeLoginAttempt(
  limiters: LoginLimiters,
  email: string,
  ipHash: string | null,
): void {
  const emailAllowed = limiters.byEmail.consume(email.toLowerCase());
  const ipAllowed = ipHash === null || limiters.byIp.consume(ipHash);

  if (!emailAllowed || !ipAllowed) {
    throw new RateLimitError(TOO_MANY_ATTEMPTS);
  }
}

const passwordChangeResponseSchema = z.object({
  changed: z.literal(true),
  /** How many other browsers were signed out, so the UI can say so. */
  revokedSessions: z.number().int().min(0),
});

export function registerAuthRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();
  const limiters = createLoginLimiters();

  routes.get(
    '/api/auth/csrf',
    {
      config: { auth: 'public' },
      schema: { response: { 200: csrfTokenResponseSchema } },
    },
    // The `onRequest` hook in plugins/csrf.ts has already resolved the binding
    // and set the cookie; this returns the same value in the body so the
    // client does not have to parse `document.cookie` to find it.
    (request) => ({ token: currentCsrfToken(request) }),
  );

  routes.post(
    '/api/auth/login',
    {
      // `public` by declaration, because there is no session yet — but *not*
      // CSRF-exempt: an anonymous binding covers it (see plugins/csrf.ts).
      config: { auth: 'public' },
      schema: {
        body: loginInputSchema,
        response: {
          200: currentUserSchema,
          401: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const ipHash = clientIpHash(app, request);
      consumeLoginAttempt(limiters, request.body.email, ipHash);

      const { user, sessionId } = await authenticate(
        app,
        request.body,
        request,
      );

      // Only a success clears the counters; a failed attempt has to keep
      // costing the attacker something.
      limiters.byEmail.reset(request.body.email.toLowerCase());
      if (ipHash !== null) {
        limiters.byIp.reset(ipHash);
      }

      setSessionCookie(app, reply, sessionId);
      // The session id is the CSRF binding and it has just changed. §5.2:
      // reissue in the same response, or the user is logged in and cannot save.
      issueCsrfCookie(app, reply, sessionId);

      return toUserDto(user);
    },
  );

  routes.post(
    '/api/auth/logout',
    {
      config: { auth: 'authenticated' },
      schema: { response: { 204: z.null() } },
    },
    async (request, reply) => {
      await deleteSession(app.prisma, currentSession(request).id);
      clearSessionCookie(app, reply);
      // `send(null)` rather than `send()`: the response schema declares the
      // body, and Fastify drops it for a 204 regardless.
      return reply.status(204).send(null);
    },
  );

  routes.get(
    '/api/auth/me',
    {
      config: { auth: 'authenticated' },
      schema: { response: { 200: currentUserSchema } },
    },
    // A single-resource endpoint returns the object directly (§8.1).
    (request) => toUserDto(currentUser(request)),
  );

  routes.post(
    '/api/auth/password',
    {
      config: { auth: 'authenticated' },
      schema: {
        body: changePasswordInputSchema,
        response: { 200: passwordChangeResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const user = currentUser(request);
      const session = currentSession(request);

      // Re-read rather than trusting the request context: the context carries
      // no hash by design, and the row may have changed since it was loaded.
      const stored = await findUserById(app.prisma, user.id);
      if (stored === null) {
        throw new UnauthorizedError();
      }

      const matches = await verifyPassword(
        stored.passwordHash,
        request.body.currentPassword,
      );
      if (!matches) {
        throw new UnauthorizedError('Nuvarande lösenord stämmer inte.');
      }

      const result = await changePassword(app, request, {
        userId: user.id,
        currentSessionId: session.id,
        passwordHash: await hashPassword(request.body.newPassword),
      });

      setSessionCookie(app, reply, result.sessionId);
      // The session id rotated, so the token derived from it did too (§5.2).
      issueCsrfCookie(app, reply, result.sessionId);

      return {
        changed: true as const,
        revokedSessions: result.revokedSessions,
      };
    },
  );
}
