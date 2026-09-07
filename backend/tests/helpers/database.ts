import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { inject } from 'vitest';

/**
 * A database of its own for the calling test file, cloned from the template
 * the global setup migrated (B0.8.2). Cloning is a file copy inside Postgres,
 * so isolation costs milliseconds rather than a migration run.
 */

export type IsolatedDatabase = {
  readonly url: string;
  readonly drop: () => Promise<void>;
};

/**
 * Postgres refuses `CREATE DATABASE ... TEMPLATE` while any session is
 * connected to the source. Nothing here connects to the template, but two
 * files cloning at the same instant can still collide, so a short retry is
 * cheaper than serialising the whole suite.
 */
const CLONE_ATTEMPTS = 5;
const CLONE_RETRY_MS = 200;

function withDatabase(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function withAdminClient<T>(
  adminUrl: string,
  run: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createIsolatedDatabase(): Promise<IsolatedDatabase> {
  const adminUrl = inject('postgresAdminUrl');
  const template = inject('templateDatabase');
  // Identifiers cannot be parameterised, so the name is generated here and
  // never derived from anything a test supplies.
  const name = `verkstad_test_${randomUUID().replaceAll('-', '')}`;

  await withAdminClient(adminUrl, async (client) => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await client.query(`CREATE DATABASE "${name}" TEMPLATE "${template}"`);
        return;
      } catch (error) {
        if (attempt >= CLONE_ATTEMPTS) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, CLONE_RETRY_MS));
      }
    }
  });

  return {
    url: withDatabase(adminUrl, name),
    drop: async () => {
      await withAdminClient(adminUrl, async (client) => {
        await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
      });
    },
  };
}
