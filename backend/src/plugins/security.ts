import fastifyCookie from '@fastify/cookie';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyInstance } from 'fastify';
import { RateLimitError } from 'shared';

/**
 * Baseline transport security (PROJECT_SPEC.md §5.4).
 *
 * Registered as a plain function rather than a plugin because these three come
 * from packages that already handle their own encapsulation, and wrapping them
 * would only add a layer to read through.
 */

/** Generous: this is the ceiling that stops abuse, not a per-feature budget. */
const GLOBAL_RATE_LIMIT_MAX = 300;
const GLOBAL_RATE_LIMIT_WINDOW = '1 minute';

export async function registerSecurity(app: FastifyInstance): Promise<void> {
  await app.register(fastifyCookie, {
    // Session and CSRF-binding cookies are signed with it (§5.1). Rotating the
    // secret invalidates every cookie, which is to say it logs everyone out.
    secret: app.env.SESSION_COOKIE_SECRET,
  });

  await app.register(fastifyHelmet, {
    // **API responses only.** The Content-Security-Policy that actually
    // protects users is the one on HTML documents, and those are served by
    // Next.js — so the page CSP lives in `next.config.ts`. Setting a strict
    // CSP here and assuming the site is covered is the common and completely
    // ineffective mistake §5.4 calls out; a JSON response has no scripts to
    // restrict.
    contentSecurityPolicy: false,
  });

  await app.register(fastifyRateLimit, {
    max: GLOBAL_RATE_LIMIT_MAX,
    timeWindow: GLOBAL_RATE_LIMIT_WINDOW,
    // Routed through the domain hierarchy so a throttled caller gets the §3.7
    // envelope with a Swedish message and a requestId, exactly like every
    // other failure, instead of the plugin's own English JSON.
    errorResponseBuilder: () => {
      throw new RateLimitError();
    },
  });
}
