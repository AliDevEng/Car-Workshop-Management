import { Decimal } from 'decimal.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseQuantity } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { seedUser } from './helpers/auth.js';
import { recordMovement } from '../src/modules/articles/stock.service.js';

/**
 * B4.3 — the stock-concurrency acceptance test, written before the ledger
 * mutations it exercises (PROJECT_SPEC.md §6.4, §8.2).
 *
 * **Definition of done:** 50 concurrent consumptions of one article leave the
 * cached `Article.stockQuantity` exactly equal to the sum of the ledger. The
 * `SELECT ... FOR UPDATE` in `recordMovement` is what serialises them; without
 * it the read-modify-write races and the cache drifts low.
 */

const CONCURRENT_CONSUMPTIONS = 50;

describe('the stock ledger under concurrency', () => {
  let harness: TestApp;
  let userId: string;

  beforeAll(async () => {
    harness = await createTestApp();
    const user = await seedUser(harness, { role: 'ADMIN' });
    userId = user.id;
  });

  afterAll(async () => {
    await harness.close();
  });

  async function newArticle(openingQuantity: string): Promise<string> {
    const article = await harness.app.prisma.article.create({
      data: {
        sku: `LEDGER-${crypto.randomUUID()}`,
        name: 'Testartikel',
        unit: 'PIECE',
        salesPriceOre: 10_000,
      },
      select: { id: true },
    });

    if (openingQuantity !== '0') {
      await harness.app.prisma.$transaction((tx) =>
        recordMovement(tx, {
          articleId: article.id,
          type: 'PURCHASE',
          amount: { kind: 'delta', value: parseQuantity(openingQuantity) },
          userId,
        }),
      );
    }
    return article.id;
  }

  async function ledgerSum(articleId: string): Promise<string> {
    const movements = await harness.app.prisma.stockMovement.findMany({
      where: { articleId },
      select: { quantity: true },
    });
    const total = movements.reduce(
      (sum, row) => sum.plus(row.quantity.toFixed()),
      new Decimal(0),
    );
    return total.toFixed();
  }

  it('keeps the cached balance equal to the ledger after 50 parallel consumptions', async () => {
    const articleId = await newArticle('100');

    const results = await Promise.all(
      Array.from({ length: CONCURRENT_CONSUMPTIONS }, () =>
        harness.app.prisma.$transaction(
          (tx) =>
            recordMovement(tx, {
              articleId,
              type: 'CONSUMPTION',
              amount: { kind: 'delta', value: parseQuantity('-1') },
              userId,
            }),
          // The pool is 10 and the lock serialises 50 transactions, so the
          // last ones queue for both a connection and the row lock.
          { maxWait: 20_000, timeout: 20_000 },
        ),
      ),
    );

    const article = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });

    expect(article.stockQuantity.toFixed()).toBe('50');
    expect(await ledgerSum(articleId)).toBe('50');

    // Every consumption saw a distinct balance — proof the lock serialised
    // them rather than letting the read-modify-write interleave.
    const balances = results
      .map((result) => result.balanceAfter.toFixed())
      .sort((a, b) => Number(a) - Number(b));
    expect(new Set(balances).size).toBe(CONCURRENT_CONSUMPTIONS);
    expect(balances.at(0)).toBe('50');
    expect(balances.at(-1)).toBe('99');
  });

  it('lets the balance go negative with a warning, never blocking', async () => {
    const articleId = await newArticle('2');

    const result = await harness.app.prisma.$transaction((tx) =>
      recordMovement(tx, {
        articleId,
        type: 'CONSUMPTION',
        amount: { kind: 'delta', value: parseQuantity('-5') },
        userId,
      }),
    );

    expect(result.balanceAfter.toFixed()).toBe('-3');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('under noll');
  });

  it('rejects a movement whose resulting balance overflows the column', async () => {
    // One step below the `Decimal(12, 3)` ceiling, then an addition that would
    // cross it. The check is inside the lock, so it rolls back with nothing
    // written rather than surfacing as a 500.
    const articleId = await newArticle('999999999');

    await expect(
      harness.app.prisma.$transaction((tx) =>
        recordMovement(tx, {
          articleId,
          type: 'PURCHASE',
          amount: { kind: 'delta', value: parseQuantity('1000') },
          userId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });

    const article = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });
    expect(article.stockQuantity.toFixed()).toBe('999999999');
    expect(
      await harness.app.prisma.stockMovement.count({ where: { articleId } }),
    ).toBe(1);
  });

  it('rejects a stocktake whose implied delta overflows the column', async () => {
    // Balance near the ceiling, counted near the floor: the delta is ~2e9,
    // outside `Decimal(12, 3)`. A 400, not a `RangeError` → 500.
    const articleId = await newArticle('999999999');

    await expect(
      harness.app.prisma.$transaction((tx) =>
        recordMovement(tx, {
          articleId,
          type: 'STOCKTAKE',
          amount: { kind: 'target', value: parseQuantity('-999999999') },
          userId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' });
  });

  it('rolls back a written movement when the surrounding transaction aborts (B4.3.2)', async () => {
    // `recordMovement` completes — movement row inserted, cache updated — and
    // then the caller throws. Prisma rolls the whole transaction back, so
    // neither the movement nor the cache change survives. This is the B6 case:
    // completion deducts several lines and writes an audit row as one unit.
    const articleId = await newArticle('10');

    await expect(
      harness.app.prisma.$transaction(async (tx) => {
        await recordMovement(tx, {
          articleId,
          type: 'CONSUMPTION',
          amount: { kind: 'delta', value: parseQuantity('-3') },
          userId,
        });
        throw new Error('caller aborts after the movement is written');
      }),
    ).rejects.toThrow('caller aborts');

    const article = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });
    expect(article.stockQuantity.toFixed()).toBe('10');
    expect(
      await harness.app.prisma.stockMovement.count({ where: { articleId } }),
    ).toBe(1);
  });

  it('throws NotFound and writes nothing for an unknown article', async () => {
    const missingId = '01900000-0000-7000-8000-000000000000';

    await expect(
      harness.app.prisma.$transaction((tx) =>
        recordMovement(tx, {
          articleId: missingId,
          type: 'ADJUSTMENT',
          amount: { kind: 'delta', value: parseQuantity('1') },
          userId,
        }),
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });

    expect(
      await harness.app.prisma.stockMovement.count({
        where: { articleId: missingId },
      }),
    ).toBe(0);
  });
});
