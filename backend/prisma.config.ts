import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'prisma/config';

const backendDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(backendDir, '..');

// Prisma 7 does not read .env (B0.4.5). This file is loaded by the Prisma CLI
// before any application code runs, so it loads the file itself rather than
// importing src/config — the CLI's loader must not be asked to pull in the
// application's module graph just to learn a connection string. A missing .env
// is not an error here: CI and production supply real environment variables.
//
// `process.loadEnvFile` does not overwrite variables that are already set, so
// an explicit `DATABASE_URL=... prisma migrate deploy` still wins over the
// developer's .env. That is load-bearing: the test harness migrates a template
// database this way, and the opposite behaviour would migrate the dev database.
const envFile = path.join(repoRoot, '.env');
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

// Read directly rather than through Prisma's `env()` helper, which throws the
// moment this module is evaluated if the variable is absent. `generate` needs
// no database at all, so that would break a fresh clone and the CI step that
// generates the client before anything is provisioned. The datasource is
// declared only when a URL exists; the commands that genuinely need one then
// fail with Prisma's own message instead.
const databaseUrl = process.env['DATABASE_URL'];

// `prisma migrate diff --from-migrations` replays the migrations into a shadow
// database and refuses to run without one. `migrate dev` creates its own
// temporary shadow database and does not need this, so the variable stays
// optional and is set only by the CI drift check.
const shadowDatabaseUrl = process.env['SHADOW_DATABASE_URL'];

export default defineConfig({
  schema: path.join(backendDir, 'prisma', 'schema.prisma'),
  migrations: {
    path: path.join(backendDir, 'prisma', 'migrations'),
    // Prisma 7 replaces package.json#prisma.seed with this entry. Seeding is
    // always run explicitly; `migrate dev` no longer implies it (B0.4.8).
    seed: 'tsx prisma/seed.ts',
  },
  ...(databaseUrl === undefined
    ? {}
    : {
        datasource: {
          url: databaseUrl,
          ...(shadowDatabaseUrl === undefined ? {} : { shadowDatabaseUrl }),
        },
      }),
});
