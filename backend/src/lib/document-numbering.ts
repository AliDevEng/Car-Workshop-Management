import type { Prisma } from '../generated/prisma/client.js';

/**
 * Document numbers — PROJECT_SPEC.md §4.4 (B6.1.2).
 *
 * `AO-2026-0001`, `OF-2026-0001`, `SP-2026-0001`, resetting each calendar
 * year, drawn from a Postgres sequence **inside the transaction that assigns
 * the number** — never `SELECT MAX(number) + 1`, which produces duplicates the
 * first time two people click at once, on the column that carries the unique
 * index.
 *
 * The sequence-per-year is created on first use by `next_document_number`, a
 * SQL function added in the B6 migration; that file documents the advisory
 * lock that makes creating it concurrency-safe. This is the second of the raw
 * statements §5.4 allows — the ledger's row lock and the last-admin lock being
 * the others — and it carries no interpolation: both arguments are bound
 * parameters and the function validates them again server-side.
 */

export const DOCUMENT_NUMBER_PREFIXES = {
  WORK_ORDER: 'AO',
  QUOTE: 'OF',
  SERVICE_PROTOCOL: 'SP',
} as const;

export type DocumentNumberPrefix =
  (typeof DOCUMENT_NUMBER_PREFIXES)[keyof typeof DOCUMENT_NUMBER_PREFIXES];

/** §4.4's format. `documentNumberSchema` in `shared` validates the same shape. */
const SEQUENCE_DIGITS = 4;

/**
 * Reads the single value out of a raw result.
 *
 * Narrowed rather than asserted with a generic on `$queryRaw`: the generic is
 * a claim about a shape nothing checks, and the driver's own choice matters
 * here — a Postgres `bigint` reaches JavaScript as a `BigInt` through
 * `@prisma/adapter-pg` and as a string through some others. Both are handled,
 * and anything else fails loudly rather than becoming `NaN` in a number.
 */
function readSequenceValue(rows: unknown): number {
  const first: unknown = Array.isArray(rows) ? rows[0] : undefined;

  if (typeof first !== 'object' || first === null || !('value' in first)) {
    throw new Error('next_document_number returned no value');
  }

  const { value } = first;
  const parsed =
    typeof value === 'bigint'
      ? Number(value)
      : typeof value === 'number'
        ? value
        : typeof value === 'string'
          ? Number(value)
          : Number.NaN;

  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(
      `next_document_number returned an unusable value: ${String(value)}`,
    );
  }
  return parsed;
}

/**
 * Assigns the next number for a document type in a calendar year.
 *
 * The year is the caller's, not `now()` inside the database: a work order
 * finalised at 00:30 on 1 January belongs to the year the workshop is in, and
 * that is a Europe/Stockholm question the caller has already answered (§3.6).
 */
export async function nextDocumentNumber(
  tx: Prisma.TransactionClient,
  prefix: DocumentNumberPrefix,
  year: number,
): Promise<string> {
  // The casts are load-bearing, not decoration: the driver is free to bind a
  // JavaScript number as `int8` or `numeric`, and PostgreSQL resolves an
  // overload by the argument types it is given — so without them the call can
  // fail with "function does not exist" on a machine that binds differently
  // from the one this was written on.
  const rows: unknown = await tx.$queryRaw`
    SELECT next_document_number(${prefix}::text, ${year}::int) AS "value"
  `;

  const sequence = readSequenceValue(rows);
  return `${prefix}-${String(year)}-${String(sequence).padStart(SEQUENCE_DIGITS, '0')}`;
}
