import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

/**
 * Copies the committed PDF fonts into `dist` (B7.1.2).
 *
 * `tsc` emits JavaScript and nothing else, so `src/pdf/fonts/*.ttf` never
 * reaches the build output on its own. `registerPdfFonts` resolves the
 * directory relative to its own module, which is `src/` under `tsx` and
 * `dist/` under `node dist/server.js` — and without this step the second one
 * fails at the first quote, in production, with a file-not-found from inside a
 * font library.
 *
 * Deliberately a Node script rather than a shell `cp`: this repository is
 * developed on Windows and deployed on Debian, and `cp -r` is not a command on
 * one of them.
 */

const source = fileURLToPath(new URL('../src/pdf/fonts', import.meta.url));
const target = fileURLToPath(new URL('../dist/pdf/fonts', import.meta.url));

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });

process.stdout.write(`Copied PDF fonts to ${target}\n`);
