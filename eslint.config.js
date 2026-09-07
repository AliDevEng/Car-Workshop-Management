// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
// Imported by relative file path, not package name: pnpm's per-package
// node_modules means the root workspace cannot resolve a bare specifier for a
// devDependency declared only in frontend/package.json.
import nextConfig from './frontend/node_modules/eslint-config-next/dist/index.js';

/** @type {import('eslint').Linter.Config[]} */
const scopedNextConfig = nextConfig
  .filter((entry) => Array.isArray(entry.files))
  .map((entry) => ({
    ...entry,
    files: entry.files.map((pattern) => `frontend/${pattern}`),
  }));

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.next/**',
      '**/build/**',
      '**/coverage/**',
      '**/generated/**',
      '**/*.d.ts',
      'backend/prisma/migrations/**',
      'frontend/next-env.d.ts',
      'infra/**',
    ],
  },
  js.configs.recommended,
  {
    // Scoped to TypeScript files only: `eslint-config-next`'s first
    // fragment reassigns the parser to a Babel-based one for plain
    // `.js`/`.mjs` config files, and a type-aware rule crashes outright if
    // it runs under a non-typescript-eslint parser instead of silently
    // skipping.
    files: ['**/*.{ts,mts,cts,tsx}'],
    extends: [...tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            '*.config.{js,mjs,ts}',
            'eslint.config.js',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // The any ban (PROJECT_SPEC.md §3.1) — set explicitly to `error`
      // because typescript-eslint's own recommended presets only warn.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unsafe-argument': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/consistent-type-assertions': [
        'error',
        { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' },
      ],
    },
  },
  ...scopedNextConfig,
  eslintConfigPrettier,
);
