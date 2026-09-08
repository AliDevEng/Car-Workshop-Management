import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import { createLoggerOptions } from './lib/logger.js';
import { getDummyPasswordHash } from './lib/password.js';
import { createPrismaClient, type Database } from './lib/prisma.js';
import authPlugin from './plugins/auth.js';
import csrfPlugin from './plugins/csrf.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import requestIdPlugin, {
  requestIdServerOptions,
} from './plugins/request-id.js';
import { registerSecurity } from './plugins/security.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { registerHealthRoutes } from './modules/health/routes.js';
import { registerUserRoutes } from './modules/users/routes.js';

declare module 'fastify' {
  interface FastifyInstance {
    readonly env: Env;
    readonly prisma: Database;
  }
}

export type BuildAppOptions = {
  readonly env: Env;
};

/** 1 MB. There are no uploads in v1 (PROJECT_SPEC.md §5.4). */
const BODY_LIMIT_BYTES = 1_048_576;

/**
 * Assembles the Fastify instance. Deliberately separate from `server.ts`, so a
 * test can build a fully wired app without binding a port (B0.5.1).
 */
export async function buildApp(
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const { env } = options;

  const app = Fastify({
    logger: createLoggerOptions(env),
    bodyLimit: BODY_LIMIT_BYTES,
    // Without this behind Caddy (§2.3), every `request.ip` is the proxy's, and
    // the per-IP login limit, the global limit and the stored `ipHash` all
    // silently describe one client. See `config/env.ts` for why it defaults
    // off rather than on.
    trustProxy: env.TRUST_PROXY,
    ...requestIdServerOptions,
  });

  // Fastify validates and serialises with JSON Schema, not Zod. Without both
  // compilers a Zod schema on `schema.response` silently does nothing
  // (PROJECT_SPEC.md §2.2, B0.5.6).
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  const prisma = createPrismaClient(env, app.log);

  app.decorate('env', env);
  app.decorate('prisma', prisma);

  // The app owns its client, so closing the app releases the pool. Tests build
  // and close many apps; a leaked pool holds connections until the run ends.
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  await app.register(requestIdPlugin);
  await app.register(errorHandlerPlugin);

  // Order matters and is not incidental:
  //   security  registers the cookie plugin the two below read from,
  //   auth      resolves the session on `onRequest`,
  //   csrf      derives its token from that session id, so it must come after.
  await registerSecurity(app);
  await app.register(authPlugin);
  await app.register(csrfPlugin);

  registerHealthRoutes(app);
  registerAuthRoutes(app);
  registerUserRoutes(app);

  // Derived now, off the request path, rather than on the first login with an
  // unknown email. Computing it lazily would make that one request ~40 ms
  // slower than a login with a known address — reintroducing, for the first
  // probe an attacker sends, exactly the timing difference §5.1 exists to
  // remove. Not awaited: it must not delay boot, only precede a request.
  void getDummyPasswordHash();

  return app;
}
