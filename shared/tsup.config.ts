import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: ['src/index.ts'],
  tsconfig: 'tsconfig.build.json',
  format: ['esm'],
  dts: true,
  sourcemap: true,
  /**
   * Never clean in watch mode.
   *
   * `pnpm dev` builds `shared` once and then starts every package in
   * parallel. `tsup --watch` used to wipe `dist/` before its first rebuild,
   * and the backend's `tsx watch` — starting in that same moment — died with
   * `ERR_MODULE_NOT_FOUND …/shared/dist/index.js`, recovering only on the
   * next file change (UI_UX_AUDIT X1). A one-off build still cleans, so a
   * removed export cannot linger in `dist` for CI.
   */
  clean: options.watch === false || options.watch === undefined,
  splitting: false,
  target: 'es2023',
}));
