import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/schemas/**'],
      // B1's Definition of Done is 100% of `shared/src`, so it is enforced
      // here rather than remembered. Everything in this package is a pure
      // function with no I/O; a line that cannot be reached by a test is a
      // line that should not exist.
      //
      // `src/schemas/**` is excluded above: a Zod schema is a declaration, and
      // asserting that `z.string()` is a string tests the library, not us.
      thresholds: {
        lines: 100,
        statements: 100,
        functions: 100,
        branches: 100,
      },
    },
  },
});
