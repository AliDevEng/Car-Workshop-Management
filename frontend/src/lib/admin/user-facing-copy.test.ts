import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Development milestone ids must not reach the screen (UI_UX_AUDIT R1).
 *
 * The vehicle page told users that service advice "kopplas in i F11.6, sedan
 * B9 finns" and the customer page that GDPR actions are activated "i F12.7".
 * Those are the project's own plan identifiers, meaningless to a workshop,
 * in Swedish copy shown directly to a user — and they arrive one placeholder
 * at a time, each individually easy to miss in review.
 *
 * So the rule is checked rather than remembered. It is a source scan, not a
 * rendered-output assertion, because the milestone id is what someone types;
 * a comment explaining *which* iteration owns a placeholder is still welcome,
 * which is why comments are stripped before the check.
 */
const MILESTONE_PATTERN = /\b[FB]\d{1,2}\.\d(?:\.\d)?\b/;

const SOURCE_ROOTS = ['src/components', 'src/app'] as const;

/**
 * The style guide is an internal design reference, not a screen any customer
 * or mechanic reaches from the navigation, and it cites the iterations its
 * examples come from on purpose.
 */
const EXEMPT = new Set(['src/components/admin/styleguide.tsx']);

const projectRoot = fileURLToPath(new URL('../../..', import.meta.url));

async function collectTsxFiles(directory: string): Promise<readonly string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectTsxFiles(full)));
    } else if (entry.name.endsWith('.tsx')) {
      files.push(full);
    }
  }
  return files;
}

/**
 * Comments are where a milestone id belongs. Stripping them can also swallow
 * the tail of a line containing `//` inside a string — a URL — which risks a
 * missed violation rather than a false one, and that is the right way round
 * for a guard that must never block a legitimate change.
 */
function stripComments(source: string): string {
  return source.replaceAll(/\/\*[\s\S]*?\*\//g, '').replaceAll(/\/\/.*$/gm, '');
}

describe('user-facing copy', () => {
  it('never shows a development milestone id', async () => {
    const offenders: string[] = [];

    for (const root of SOURCE_ROOTS) {
      const files = await collectTsxFiles(join(projectRoot, root));
      for (const file of files) {
        const relativePath = relative(projectRoot, file).replaceAll('\\', '/');
        if (EXEMPT.has(relativePath)) {
          continue;
        }
        const lines = stripComments(await readFile(file, 'utf8')).split('\n');
        for (const [index, line] of lines.entries()) {
          const match = MILESTONE_PATTERN.exec(line);
          if (match !== null) {
            offenders.push(
              `${relativePath}:${String(index + 1)} — ${match[0]}`,
            );
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });
});
