import {
  compareQuantity,
  parseQuantity,
  quantityToString,
  subQuantity,
  ZERO_QUANTITY,
} from 'shared';
import { toDecimalString } from '../lib/dto-decimal.js';
import type { AnyDbClient } from '../lib/prisma.js';
import type { JobLogger } from './lock.js';

/**
 * The nightly stock reconciliation (PROJECT_SPEC.md §4.2, §8.4, B11.3.2).
 *
 * §4.2 makes the ledger the truth and `Article.stockQuantity` a cache kept
 * beside it under the same row lock `recordMovement` takes for every write —
 * so in a correctly running system the two never drift. This job exists to
 * *notice* the day that stops being true, by re-deriving every balance from
 * the ledger and comparing it against the cache. It only logs what it finds;
 * correcting a drift is a human decision (a stocktake, §6.4), not something a
 * nightly job should do unattended to a number the workshop prices its parts
 * against.
 */

export type StockDrift = {
  readonly articleId: string;
  readonly sku: string;
  readonly cachedQuantity: string;
  readonly ledgerQuantity: string;
  readonly driftQuantity: string;
};

export async function reconcileStockLedger(
  db: AnyDbClient,
  logger: JobLogger,
): Promise<readonly StockDrift[]> {
  const [articles, sums] = await Promise.all([
    db.article.findMany({
      select: { id: true, sku: true, stockQuantity: true },
    }),
    db.stockMovement.groupBy({
      by: ['articleId'],
      _sum: { quantity: true },
    }),
  ]);

  const ledgerByArticleId = new Map(
    sums.map((row) => [row.articleId, row._sum.quantity]),
  );

  const drifts: StockDrift[] = [];
  for (const article of articles) {
    const cached = parseQuantity(toDecimalString(article.stockQuantity));
    const ledgerRaw = ledgerByArticleId.get(article.id);
    const ledger =
      ledgerRaw === undefined || ledgerRaw === null
        ? ZERO_QUANTITY
        : parseQuantity(toDecimalString(ledgerRaw));

    if (compareQuantity(cached, ledger) !== 0) {
      drifts.push({
        articleId: article.id,
        sku: article.sku,
        cachedQuantity: quantityToString(cached),
        ledgerQuantity: quantityToString(ledger),
        driftQuantity: quantityToString(subQuantity(cached, ledger)),
      });
    }
  }

  if (drifts.length > 0) {
    logger.warn(
      { job: 'stock-reconciliation', drifts },
      `Stock ledger drift detected on ${String(drifts.length)} article(s)`,
    );
  } else {
    logger.info(
      { job: 'stock-reconciliation', articleCount: articles.length },
      'Stock ledger matches the cache for every article',
    );
  }

  return drifts;
}
