import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { loadDotEnv } from '../src/config/dotenv.js';

/**
 * Configuration for the B13 performance tooling.
 *
 * Separate from `src/config/env.ts` on purpose. That file validates what the
 * *server* needs to boot and is the only place application code may read
 * `process.env` (B0.6.4); this one validates what a *measurement script* needs,
 * and those scripts are not application code — they are never imported by
 * `app.ts` and never reach a request path.
 *
 * The connection string is plain `DATABASE_URL`, overridden per command the
 * same way the test harness and `prisma migrate deploy` already do it
 * (B0.4.5) — rather than a second `PERF_DATABASE_URL` concept that would then
 * have to be kept in agreement with the first:
 *
 *   DATABASE_URL=...verkstad_perf pnpm --filter backend perf:seed
 */

const perfEnvSchema = z.object({
  DATABASE_URL: z.url(),
  /** The running server under test. Not a URL the browser ever sees. */
  PERF_BASE_URL: z.url().default('http://127.0.0.1:3001'),
  /** The staff account the harness logs in as; `prisma/seed.ts`'s admin. */
  PERF_EMAIL: z.email().default('admin@verkstaden.se'),
  PERF_PASSWORD: z.string().min(1).default('utveckling-admin-2026'),
  /**
   * How B13.3.5's steady-state memory is sampled. A container name uses
   * `docker stats`; a pid reads the process directly. Neither is guessed at:
   * with both absent the run reports memory as "not sampled" rather than
   * printing a number it did not measure.
   */
  PERF_MEMORY_CONTAINER: z.string().min(1).optional(),
  PERF_MEMORY_PID: z.coerce.number().int().positive().optional(),
  /**
   * Whether each virtual user presents its own `X-Forwarded-For`.
   *
   * §5.4's global limit is 300 requests per minute **per IP**, and twenty
   * virtual users on one socket exceed that in seconds — so a run from a
   * single address measures the rate limiter rather than the endpoints. With
   * this on (and `TRUST_PROXY=true` on the server, as behind Caddy) each
   * virtual user gets its own bucket, which is what twenty people at twenty
   * keyboards would actually look like. Both runs are worth having: off says
   * what the ceiling does, on says what the endpoints do.
   */
  PERF_FORWARDED_FOR: z.stringbool().default(false),
  /** Reproducibility: the same seed replays the same scenario sequence. */
  PERF_SEED: z.coerce.number().int().default(20_260_921),
});

export type PerfConfig = z.infer<typeof perfEnvSchema>;

/**
 * The guard that keeps a 200 000-row dataset out of the developer's own
 * database. `perf:seed` is a destructive-by-volume command — it cannot be
 * undone by deleting rows, because nobody knows afterwards which 20 000 work
 * orders were real — so the database has to say, in its own name, that it is
 * for this.
 */
const PERF_DATABASE_SUFFIX = '_perf';

export function assertPerfDatabase(config: PerfConfig): void {
  const databaseName = new URL(config.DATABASE_URL).pathname.replace(/^\//, '');

  if (!databaseName.endsWith(PERF_DATABASE_SUFFIX)) {
    throw new Error(
      `Refusing to write the performance dataset into "${databaseName}". ` +
        `Point DATABASE_URL at a database whose name ends in ` +
        `"${PERF_DATABASE_SUFFIX}" — see backend/perf/README.md.`,
    );
  }
}

/**
 * The document store is the other half of the same state, and it needs the
 * same guard.
 *
 * `STORAGE_PATH` defaults to `./storage` — the developer's own document store,
 * holding real PDFs from real development work. A performance run sends
 * hundreds of quotes, so pointing it there would bury those files among
 * generated ones and, worse, hand the run a store whose `OF-` numbers a
 * freshly-seeded database is about to reuse: `documents/storage.ts` refuses to
 * overwrite an existing file (§8.3), so the first quote sent answers
 * `500 EEXIST` and the PDF budget fails for a reason that has nothing to do
 * with the renderer. Both halves of that were found by running B13.3, not by
 * reading the code.
 */
const PERF_STORAGE_MARKER = 'perf';

export function assertPerfStorage(storagePath: string): void {
  const resolved = path.resolve(storagePath);

  if (!path.basename(resolved).toLowerCase().includes(PERF_STORAGE_MARKER)) {
    throw new Error(
      `Refusing to use the document store at ${resolved} for a performance ` +
        `run: its name does not contain "${PERF_STORAGE_MARKER}", so this is ` +
        'probably the development store. Point STORAGE_PATH at a ' +
        'performance-specific directory — see backend/perf/README.md.',
    );
  }

  const documents = path.join(resolved, 'documents');
  if (existsSync(documents) && readdirSync(documents).length > 0) {
    throw new Error(
      `The document store at ${documents} is not empty, but this database is ` +
        'new — so its document numbers restart at 1 and the first quote sent ' +
        `will collide with a PDF already on disk. Clear it alongside the ` +
        `database: rm -rf "${documents}"`,
    );
  }
}

/**
 * Parsed once, by the entry point that needs it. A `z.treeifyError` dump is
 * unreadable for four variables, so each problem is printed as its own line —
 * the same shape `config/env.ts` uses for the server's own variables.
 */
export function loadPerfConfig(): PerfConfig {
  loadDotEnv();

  const result = perfEnvSchema.safeParse(process.env);
  if (result.success) {
    return result.data;
  }

  const lines = result.error.issues.map(
    (issue) => `  ${issue.path.join('.')}: ${issue.message}`,
  );
  throw new Error(`Performance configuration is invalid:\n${lines.join('\n')}`);
}
