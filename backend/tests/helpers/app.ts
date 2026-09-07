import type { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/app.js';
import { parseEnv, type Env } from '../../src/config/env.js';
import { createIsolatedDatabase } from './database.js';

/**
 * Builds a fully wired app without binding a port (B0.5.1, B0.8.3).
 */

export type TestAppOptions = {
  /**
   * `'isolated'` clones the migrated template into a database of this test
   * file's own. `'none'` skips it: Prisma connects lazily, so a test that only
   * exercises routing, validation or error mapping needs no database at all,
   * and should not be slowed down or made flaky by one.
   */
  readonly database?: 'isolated' | 'none';
  /** Extra routes, registered before `ready()`. Used to exercise plugins. */
  readonly register?: (app: FastifyInstance) => void;
};

export type TestApp = {
  readonly app: FastifyInstance;
  readonly env: Env;
  /** Closes the app and drops its database. Always call it from `afterAll`. */
  readonly close: () => Promise<void>;
};

/**
 * A complete, valid environment that never depends on the developer's `.env`.
 * A test that passes only because a real machine happened to be configured a
 * certain way is worse than no test.
 */
export function testEnv(overrides: Record<string, string> = {}): Env {
  return parseEnv({
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://unused:unused@127.0.0.1:1/unused',
    SESSION_COOKIE_SECRET: 'a'.repeat(64),
    IP_HASH_SALT: 's'.repeat(32),
    FORM_TOKEN_SECRET: 'f'.repeat(32),
    PUBLIC_BASE_URL: 'http://localhost:3000',
    STORAGE_PATH: './storage',
    ...overrides,
  });
}

export async function createTestApp(
  options: TestAppOptions = {},
): Promise<TestApp> {
  const database =
    (options.database ?? 'isolated') === 'isolated'
      ? await createIsolatedDatabase()
      : undefined;

  const env = testEnv(
    database === undefined ? {} : { DATABASE_URL: database.url },
  );

  const app = await buildApp({ env });
  options.register?.(app);
  await app.ready();

  return {
    app,
    env,
    close: async () => {
      await app.close();
      await database?.drop();
    },
  };
}
