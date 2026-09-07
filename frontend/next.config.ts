import type { NextConfig } from 'next';

const BACKEND_ORIGIN = process.env.BACKEND_DEV_ORIGIN ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  // `shared` ships TypeScript source consumed as a workspace package; Next
  // does not compile workspace packages by default (PROJECT_SPEC.md §2.1).
  transpilePackages: ['shared'],

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
