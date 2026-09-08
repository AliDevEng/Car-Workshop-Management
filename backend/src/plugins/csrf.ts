import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import fp from 'fastify-plugin';
import { CSRF_COOKIE_NAME, CSRF_TOKEN_HEADER, ForbiddenError } from 'shared';

/**
 * CSRF protection (PROJECT_SPEC.md §5.2, B2.5).
 *
 * Cookie authentication means CSRF has to be handled explicitly. The token is
 * **an HMAC of the session id**, not a free-floating random value: comparing a
 * cookie to a header only proves the two match, whereas binding the token to
 * the session also proves it belongs to *this* session, which closes the
 * session-fixation variant.
 *
 * ## The gap B2.5 asks to reconcile first
 *
 * Login and the public vehicle lookup have no session on first use, so a token
 * derived from a session id would not exist for them. Exempting them is not an
 * option — login CSRF logs a victim into the attacker's account, and §5.2 says
 * never to exempt by prefix.
 *
 * So an anonymous caller gets a binding of their own: a random id in an
 * httpOnly cookie, which the token is HMAC'd from exactly as a session id
 * would be. Every unsafe request is then protected by the same one rule, and
 * the only allow-listed route in the system is the public booking endpoint,
 * which §6.2 protects with its own four layers instead.
 */

/**
 * Holds the anonymous binding. httpOnly, because unlike the token cookie the
 * page never needs to read it — and a value the page cannot read is a value an
 * injected script cannot copy into a forged request.
 */
const CSRF_BINDING_COOKIE_NAME = 'verkstad_csrf_binding';

/**
 * The only route that may skip the check (§5.2). An explicit list, in one
 * place, rather than a per-route flag: a flag lets any future route quietly
 * exempt itself, and this is the kind of decision that should require editing
 * a file named `csrf.ts`.
 */
export const CSRF_EXEMPT_ROUTES: readonly string[] = [
  'POST /api/public/booking-requests',
];

/** Methods that cannot change state, and so need no token. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

declare module 'fastify' {
  interface FastifyRequest {
    /** The token this request's cookie carries. Set by the hook below. */
    csrfToken: string | null;
  }
}

/**
 * The token for this request, for `GET /api/auth/csrf` to return in a body.
 * Null is impossible once the hook has run, so it is a bug rather than a
 * client error — but it is still not asserted away with `!` (CLAUDE.md).
 */
export function currentCsrfToken(request: FastifyRequest): string {
  if (request.csrfToken === null) {
    throw new Error('CSRF token requested before the csrf hook ran.');
  }
  return request.csrfToken;
}

/**
 * Derives the token. The purpose string keeps this HMAC distinct from any
 * other use of the same secret — a signature that is valid in two contexts is
 * a signature that can be moved between them.
 */
export function deriveCsrfToken(secret: string, binding: string): string {
  return createHmac('sha256', secret).update(`csrf:${binding}`).digest('hex');
}

function safeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  // `timingSafeEqual` throws on a length mismatch, which would itself leak the
  // length; checking first and returning is constant with respect to content.
  return left.length === right.length && timingSafeEqual(left, right);
}

function csrfCookieOptions(app: FastifyInstance): {
  httpOnly: false;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
} {
  return {
    // Readable by the page on purpose: the browser has to copy it into the
    // `X-CSRF-Token` header, which is the half of the double submit that a
    // cross-site attacker cannot perform.
    httpOnly: false,
    secure: app.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

/**
 * Issues the CSRF cookie for a binding. Exported because **anything that
 * rotates the session id must reissue it in the same response** (§5.2) — login
 * and password change both do. Forgetting produces a user who is logged in and
 * cannot save anything, and the error looks like a permissions bug.
 */
export function issueCsrfCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  binding: string,
): string {
  const token = deriveCsrfToken(app.env.SESSION_COOKIE_SECRET, binding);
  reply.setCookie(CSRF_COOKIE_NAME, token, csrfCookieOptions(app));
  return token;
}

/**
 * The value this request's token is derived from: the session id when there is
 * one, otherwise the anonymous binding — creating and setting it if this is
 * the visitor's first unsafe-capable page load.
 */
function resolveBinding(
  app: FastifyInstance,
  request: FastifyRequest,
  reply: FastifyReply,
): string {
  if (request.session !== null) {
    return request.session.id;
  }

  const existing = request.cookies[CSRF_BINDING_COOKIE_NAME];
  if (existing !== undefined) {
    const unsigned = request.unsignCookie(existing);
    if (unsigned.valid && unsigned.value !== null) {
      return unsigned.value;
    }
  }

  const binding = randomBytes(32).toString('hex');
  reply.setCookie(CSRF_BINDING_COOKIE_NAME, binding, {
    httpOnly: true,
    secure: app.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    signed: true,
  });
  return binding;
}

function readHeaderToken(request: FastifyRequest): string | undefined {
  const supplied = request.headers[CSRF_TOKEN_HEADER];
  return Array.isArray(supplied) ? supplied[0] : supplied;
}

const csrfPlugin: FastifyPluginCallback = (app, _options, done) => {
  /**
   * Runs after the auth plugin's `onRequest` hook, so `request.session` is
   * already resolved and the binding is the real session id rather than an
   * anonymous one that would be replaced a moment later.
   */
  app.decorateRequest('csrfToken', null);

  app.addHook('onRequest', (request, reply, next) => {
    const binding = resolveBinding(app, request, reply);
    const expected = deriveCsrfToken(app.env.SESSION_COOKIE_SECRET, binding);
    request.csrfToken = expected;

    // Kept in sync on every request rather than only when missing: after a
    // login the binding changes, and a stale cookie would fail every save
    // until the user cleared it by hand.
    if (request.cookies[CSRF_COOKIE_NAME] !== expected) {
      reply.setCookie(CSRF_COOKIE_NAME, expected, csrfCookieOptions(app));
    }

    if (SAFE_METHODS.has(request.method)) {
      next();
      return;
    }

    const routeKey = `${request.method} ${request.routeOptions.url ?? request.url}`;
    if (CSRF_EXEMPT_ROUTES.includes(routeKey)) {
      next();
      return;
    }

    const supplied = readHeaderToken(request);
    if (supplied === undefined || !safeEquals(supplied, expected)) {
      next(
        new ForbiddenError(
          'Säkerhetstoken saknas eller är ogiltig. Ladda om sidan och försök igen.',
        ),
      );
      return;
    }

    next();
  });

  done();
};

export default fp(csrfPlugin, { name: 'csrf', dependencies: ['auth'] });
