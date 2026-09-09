import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { documentNumberSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import {
  DOCUMENT_NUMBER_PREFIXES,
  nextDocumentNumber,
} from '../src/lib/document-numbering.js';

/**
 * B6.1.2 — document numbering (PROJECT_SPEC.md §4.4).
 *
 * A Postgres sequence per type per year, drawn inside the assigning
 * transaction. **Not** `SELECT MAX(number) + 1`, which produces duplicates the
 * first time two people click at once — on the column that carries the unique
 * index, so the second click fails with a 500 rather than getting the next
 * number.
 */

describe('nextDocumentNumber', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  function draw(prefix: 'AO' | 'OF' | 'SP', year: number): Promise<string> {
    return harness.app.prisma.$transaction((tx) =>
      nextDocumentNumber(tx, prefix, year),
    );
  }

  it('produces the §4.4 format, which `shared` also validates', () => {
    return draw(DOCUMENT_NUMBER_PREFIXES.WORK_ORDER, 2026).then((number) => {
      expect(number).toBe('AO-2026-0001');
      expect(documentNumberSchema.safeParse(number).success).toBe(true);
    });
  });

  it('increments within one type and year', async () => {
    await draw('OF', 2026);
    expect(await draw('OF', 2026)).toBe('OF-2026-0002');
  });

  it('keeps a sequence per type', async () => {
    // The quote series must not consume numbers from the work-order series.
    expect(await draw('SP', 2026)).toBe('SP-2026-0001');
  });

  it('resets each calendar year', async () => {
    await draw('AO', 2026);
    expect(await draw('AO', 2027)).toBe('AO-2027-0001');
    expect(await draw('AO', 2027)).toBe('AO-2027-0002');
  });

  it('creates a new year’s sequence exactly once under concurrency', async () => {
    // The interesting race is the DDL, not the counter: two transactions
    // issuing `CREATE SEQUENCE IF NOT EXISTS` for the same new year at the
    // same moment do not both succeed — one fails on `pg_type`'s unique
    // index. That is a 500 on the first work order of January, and it is
    // impossible to reproduce afterwards. The advisory lock in the migration
    // is what serialises it.
    const drawn = await Promise.all(
      Array.from({ length: 12 }, () => draw('AO', 2031)),
    );

    expect(new Set(drawn).size).toBe(12);
    expect([...drawn].sort()).toEqual(
      Array.from(
        { length: 12 },
        (_unused, index) => `AO-2031-${String(index + 1).padStart(4, '0')}`,
      ),
    );
  });

  it('hands out a distinct number to every concurrent caller', async () => {
    const drawn = await Promise.all(
      Array.from({ length: 25 }, () => draw('AO', 2032)),
    );

    // The property that matters: no duplicates, ever. Gaps are allowed —
    // `nextval` is non-transactional, so a rolled-back assignment leaves one,
    // and §4.4 asks for numbers that are unique and increasing, not
    // contiguous.
    expect(new Set(drawn).size).toBe(25);
  });

  it('refuses a prefix or year the format cannot represent', async () => {
    // Belt and braces behind the TypeScript union: the SQL function validates
    // its own arguments, because it is reachable from any future caller.
    await expect(
      harness.app.prisma.$transaction(
        (tx) =>
          tx.$queryRaw`SELECT next_document_number('bad'::text, 2026::int)`,
      ),
    ).rejects.toThrow();

    await expect(
      harness.app.prisma.$transaction(
        (tx) => tx.$queryRaw`SELECT next_document_number('AO'::text, 12::int)`,
      ),
    ).rejects.toThrow();
  });
});
