import Fastify, { type FastifyInstance } from 'fastify';
import {
  serializerCompiler,
  validatorCompiler,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import { createLoggerOptions } from './lib/logger.js';
import { createPrismaClient, type Database } from './lib/prisma.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import requestIdPlugin, {
  requestIdServerOptions,
} from './plugins/request-id.js';
import { registerHealthRoutes } from './modules/health/routes.js';

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

  registerHealthRoutes(app);

  return app;
}
