import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';

/**
 * Load the repository-root `.env`, mirroring `backend/src/config/dotenv.ts`.
 *
 * Next.js reads `.env` files from its own project directory, and this is a
 * pnpm workspace with a single `.env` at the root (root README, "Environment
 * variables"). Without this, `INTERNAL_API_URL` is never defined in the
 * frontend process, every server-component API call fails before it is made,
 * and the failure is indistinguishable from the backend being down.
 *
 * A missing file is not an error — production supplies real environment
 * variables — and values already in the environment win, so
 * `INTERNAL_API_URL=... pnpm dev` still overrides.
 */
function loadWorkspaceDotEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const envFile = path.resolve(here, '..', '.env');
  if (existsSync(envFile)) {
    process.loadEnvFile(envFile);
  }
}

loadWorkspaceDotEnv();

// 127.0.0.1 rather than `localhost`, which resolves to ::1 first on Node 18+
// while the backend binds the IPv4 address given by HOST in `.env`.
const BACKEND_ORIGIN =
  process.env.BACKEND_DEV_ORIGIN ?? 'http://127.0.0.1:3001';

const nextConfig: NextConfig = {
  // `shared` ships TypeScript source consumed as a workspace package; Next
  // does not compile workspace packages by default (PROJECT_SPEC.md §2.1).
  transpilePackages: ['shared'],

  // A self-contained `.next/standalone` server with only the dependencies it
  // actually traces, rather than the full `node_modules` tree — what
  // `frontend/Dockerfile` copies into the production image (B12.1).
  output: 'standalone',

  images: {
    qualities: [60, 75],
  },

  rewrites() {
    // Development-only convenience: production routes /api/* to the backend
    // via Caddy (README.md "Runtime topology"), so the browser always calls
    // the same relative /api path in both environments.
    if (process.env.NODE_ENV !== 'development') {
      return Promise.resolve([]);
    }
    return Promise.resolve([
      {
        source: '/api/:path*',
        destination: `${BACKEND_ORIGIN}/api/:path*`,
      },
    ]);
  },
};

export default nextConfig;
