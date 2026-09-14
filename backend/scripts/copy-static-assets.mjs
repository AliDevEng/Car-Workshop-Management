import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Copies committed, non-`.ts` assets into `dist` (B7.1.2, B10.1.2).
 *
 * `tsc` emits JavaScript and nothing else, so nothing under `src/**` that
 * is not a `.ts` file reaches the build output on its own. Each consumer
 * (`pdf/fonts.ts`, `integrations/vehicle-data/mock-provider.ts`) resolves its
 * directory relative to its own module, which is `src/` under `tsx` and
 * `dist/` under `node dist/server.js` — without this step the second one
 * fails at the first request that needs the asset, in production, with a
 * file-not-found from inside the module that reads it.
 *
 * Deliberately a Node script rather than a shell `cp`: this repository is
 * developed on Windows and deployed on Debian, and `cp -r` is not a command on
 * one of them.
 */

const copies = [
  ['../src/pdf/fonts', '../dist/pdf/fonts'],
  [
    '../src/integrations/vehicle-data/fixtures',
    '../dist/integrations/vehicle-data/fixtures',
  ],
];

for (const [from, to] of copies) {
  const source = fileURLToPath(new URL(from, import.meta.url));
  const target = fileURLToPath(new URL(to, import.meta.url));
  await mkdir(target, { recursive: true });
  await cp(source, target, { recursive: true });
  process.stdout.write(`Copied ${source} to ${target}\n`);
}
