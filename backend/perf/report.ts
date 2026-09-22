import type { BudgetVerdict, Summary } from './stats.js';

/**
 * Printing. Kept away from the measuring so that neither has to be read to
 * understand the other, and so a table can change shape without anything
 * that produced a number being touched.
 *
 * `console` rather than Pino: these are operator scripts whose output a person
 * reads in a terminal and pastes into `backend/README.md`, not a server's
 * structured log. CLAUDE.md's `no-console` rule is scoped to `backend/src` and
 * `backend/prisma` for exactly this reason — a Pino line has a `requestId` to
 * correlate, and a budget table has nothing to correlate with.
 */

function pad(value: string, width: number): string {
  return value.length >= width
    ? value
    : value + ' '.repeat(width - value.length);
}

function padLeft(value: string, width: number): string {
  return value.length >= width
    ? value
    : ' '.repeat(width - value.length) + value;
}

function ms(value: number): string {
  return Number.isNaN(value) ? '—' : value.toFixed(1);
}

export function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

const NAME_WIDTH = 44;
const NUMBER_WIDTH = 9;

export function printSummaryTable(
  rows: readonly { readonly name: string; readonly summary: Summary }[],
): void {
  const header =
    pad('endpoint', NAME_WIDTH) +
    ['n', 'p50', 'p95', 'p99', 'max', 'err']
      .map((label) => padLeft(label, NUMBER_WIDTH))
      .join('');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const row of rows) {
    console.log(
      pad(row.name, NAME_WIDTH) +
        padLeft(String(row.summary.count), NUMBER_WIDTH) +
        padLeft(ms(row.summary.p50Ms), NUMBER_WIDTH) +
        padLeft(ms(row.summary.p95Ms), NUMBER_WIDTH) +
        padLeft(ms(row.summary.p99Ms), NUMBER_WIDTH) +
        padLeft(ms(row.summary.maxMs), NUMBER_WIDTH) +
        padLeft(String(row.summary.errors), NUMBER_WIDTH),
    );
  }
}

export function printVerdicts(verdicts: readonly BudgetVerdict[]): void {
  console.log('');
  for (const verdict of verdicts) {
    console.log(
      `${verdict.passed ? 'PASS' : 'FAIL'}  ${pad(verdict.name, 24)} ${verdict.reason}`,
    );
  }
}

/**
 * The exit code is the whole point of the script: a budget run that prints
 * "FAIL" and exits `0` is a budget nobody is held to.
 */
export function exitCodeFor(verdicts: readonly BudgetVerdict[]): number {
  return verdicts.every((verdict) => verdict.passed) ? 0 : 1;
}
