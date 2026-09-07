import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Load the repository-root `.env` into `process.env`.
 *
 * Prisma 7 no longer does this, and neither does Node unless asked (B0.4.5).
 * Called from the entry points only — `server.ts` and the test bootstrap — so
 * that importing a module never has the side effect of reading a file.
 *
 * A missing file is not an error: CI and production supply real environment
 * variables, and `config/env.ts` is what decides whether the result is valid.
 * Values already present in the environment win, which is what makes
 * `DATABASE_URL=... pnpm dev` work.
 */
export function loadDotEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // src/config -> src -> backend -> repository root
  const envFile = path.resolve(here, '..', '..', '..', '.env');

  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}
