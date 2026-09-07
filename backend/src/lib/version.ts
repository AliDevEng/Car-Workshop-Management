import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/**
 * The version reported by `GET /api/health`.
 *
 * Read from `backend/package.json` by walking up from this module, so that the
 * same code works from `src/` under tsx and from `dist/` under node without a
 * build-time substitution step. `npm_package_version` is not used: it is only
 * present when the process was started by a package manager, and reading
 * `process.env` outside `config/env.ts` is banned (B0.6.4).
 */

const manifestSchema = z.object({
  name: z.string(),
  version: z.string(),
});

const UNKNOWN_VERSION = '0.0.0-unknown';

function readVersion(): string {
  let directory = path.dirname(fileURLToPath(import.meta.url));

  // src/lib -> src -> backend, or dist/lib -> dist -> backend.
  for (let depth = 0; depth < 5; depth += 1) {
    const candidate = path.join(directory, 'package.json');

    try {
      const parsed: unknown = JSON.parse(readFileSync(candidate, 'utf8'));
      const manifest = manifestSchema.safeParse(parsed);
      if (manifest.success && manifest.data.name === 'backend') {
        return manifest.data.version;
      }
    } catch {
      // Not here, or not readable. Keep walking.
    }

    const parent = path.dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }

  return UNKNOWN_VERSION;
}

export const APP_VERSION: string = readVersion();
