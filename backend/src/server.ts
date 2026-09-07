import { buildApp } from './app.js';
import { loadDotEnv } from './config/dotenv.js';
import { loadEnv } from './config/env.js';

/**
 * Process entry point. Everything that binds a port, reads a file or installs
 * a signal handler lives here; `app.ts` stays buildable from a test (B0.5.1).
 */

loadDotEnv();
const env = loadEnv();

const app = await buildApp({ env });

/**
 * Graceful shutdown (B0.5.4). Fastify stops accepting connections, in-flight
 * requests finish, then the `onClose` hook disconnects Prisma. A second signal
 * while a shutdown is already running is ignored rather than compounding it.
 */
let shuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  app.log.info({ signal }, 'Shutting down');
  try {
    await app.close();
    process.exitCode = 0;
  } catch (error) {
    app.log.error({ err: error }, 'Shutdown failed');
    process.exitCode = 1;
  }
}

for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    void shutdown(signal);
  });
}

try {
  await app.listen({ host: env.HOST, port: env.PORT });
} catch (error) {
  app.log.fatal({ err: error }, 'Failed to start');
  process.exit(1);
}
