import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit tests sit beside the code they cover; route and database tests live
    // in tests/ because they need the harness.
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    globalSetup: ['tests/setup/global-database.ts'],
    // Starting a container is slow; nothing else here is.
    hookTimeout: 180_000,
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/generated/**',
        // Entry point: it binds a port and installs signal handlers, and is
        // covered by running the process rather than by a unit test.
        'src/server.ts',
      ],
      thresholds: {
        lines: 80,
        statements: 80,
      },
    },
  },
});
