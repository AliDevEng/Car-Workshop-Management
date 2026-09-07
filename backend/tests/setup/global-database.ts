import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { Client } from 'pg';
import {
  GenericContainer,
  Wait,
  type StartedTestContainer,
} from 'testcontainers';
import type { TestProject } from 'vitest/node';

/**
 * One PostgreSQL instance for the whole run, migrated once into a template
 * database. Each test file then clones that template, which is a local file
 * copy rather than a fresh migration run (B0.8.2).
 *
 * Starting a container per file is the obvious alternative and costs tens of
 * seconds each; a suite that slow stops being run before every commit, which
 * is the failure mode this arrangement exists to avoid.
 *
 * `TEST_DATABASE_URL` short-circuits the container entirely, so CI can use a
 * service container and a machine without Docker can point at a local server.
 */

declare module 'vitest' {
  interface ProvidedContext {
    /** Connection string for the maintenance database (`postgres`). */
    postgresAdminUrl: string;
    /** Name of the migrated database that per-file databases are cloned from. */
    templateDatabase: string;
  }
}

const execFileAsync = promisify(execFile);

const POSTGRES_IMAGE = 'postgres:16';
const TEMPLATE_DATABASE = 'verkstad_template';

const backendDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
);

let container: StartedTestContainer | undefined;

function withDatabase(adminUrl: string, database: string): string {
  const url = new URL(adminUrl);
  url.pathname = `/${database}`;
  return url.toString();
}

async function startContainer(): Promise<string> {
  container = await new GenericContainer(POSTGRES_IMAGE)
    .withEnvironment({
      POSTGRES_USER: 'verkstad_test',
      POSTGRES_PASSWORD: 'verkstad_test',
      POSTGRES_DB: 'postgres',
    })
    .withExposedPorts(5432)
    // The data directory is thrown away with the container, so durability buys
    // nothing here and costs most of the suite's wall-clock time.
    .withTmpFs({ '/var/lib/postgresql/data': 'rw' })
    .withCommand(['postgres', '-c', 'fsync=off', '-c', 'full_page_writes=off'])
    .withWaitStrategy(
      // Postgres logs "ready to accept connections" once for the bootstrap
      // instance and again for the real one; waiting for the first connects
      // to a server that is about to be shut down.
      Wait.forLogMessage(/database system is ready to accept connections/, 2),
    )
    .withStartupTimeout(120_000)
    .start();

  const host = container.getHost();
  const port = container.getMappedPort(5432);
  return `postgresql://verkstad_test:verkstad_test@${host}:${port}/postgres`;
}

async function createTemplateDatabase(adminUrl: string): Promise<void> {
  const client = new Client({ connectionString: adminUrl });
  await client.connect();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${TEMPLATE_DATABASE}"`);
    await client.query(`CREATE DATABASE "${TEMPLATE_DATABASE}"`);
  } finally {
    await client.end();
  }
}

async function applyMigrations(templateUrl: string): Promise<void> {
  const prismaCli = createRequire(import.meta.url).resolve(
    'prisma/build/index.js',
  );

  // `process.loadEnvFile` in prisma.config.ts does not overwrite variables
  // that are already set, so the template URL below wins over the developer's
  // .env — verified, because getting this wrong migrates the dev database.
  await execFileAsync(process.execPath, [prismaCli, 'migrate', 'deploy'], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: templateUrl },
  });
}

export default async function setup({
  provide,
}: TestProject): Promise<() => Promise<void>> {
  const external = process.env['TEST_DATABASE_URL'];
  const adminUrl = external ?? (await startContainer());

  await createTemplateDatabase(adminUrl);
  await applyMigrations(withDatabase(adminUrl, TEMPLATE_DATABASE));

  provide('postgresAdminUrl', adminUrl);
  provide('templateDatabase', TEMPLATE_DATABASE);

  return async () => {
    await container?.stop();
    container = undefined;
  };
}
