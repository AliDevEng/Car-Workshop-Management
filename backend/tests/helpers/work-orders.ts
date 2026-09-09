import supertest from 'supertest';
import { parseQuantity } from 'shared';
import { recordMovement } from '../../src/modules/articles/stock.service.js';
import type { TestApp } from './app.js';
import { withAgent, type Agent } from './auth.js';

/**
 * Fixtures for the B6 work-order tests.
 *
 * Customers, vehicles and articles are seeded straight into the database:
 * their own creation paths are covered by B3 and B4, and going through those
 * APIs here would make a work-order test fail for a reason that has nothing to
 * do with work orders. The work orders themselves always go through the real
 * API, because that is what is under test.
 */

export type SeededSubject = {
  readonly customerId: string;
  readonly vehicleId: string;
};

let plateCounter = 0;

/**
 * A unique, valid Swedish plate: `AAA01A`, `BAA01A`, … The letters are a
 * base-26 counter, so two subjects in one test file cannot collide on the
 * unique index — a `crypto.randomUUID()` would not fit the plate format that
 * `normalisedRegistrationNumberSchema` enforces.
 */
function nextPlate(): string {
  plateCounter += 1;
  const letter = (place: number): string =>
    String.fromCharCode(65 + (Math.floor(plateCounter / place) % 26));
  return `${letter(1)}${letter(26)}${letter(676)}01A`;
}

export async function seedSubject(harness: TestApp): Promise<SeededSubject> {
  const customer = await harness.app.prisma.customer.create({
    data: {
      type: 'PRIVATE',
      name: 'Anna Svensson',
      phone: '070-123 45 67',
      phoneNormalised: '+46701234567',
    },
    select: { id: true },
  });

  const registrationNumber = nextPlate();
  const vehicle = await harness.app.prisma.vehicle.create({
    data: {
      registrationNumber,
      registrationNumberDisplay: registrationNumber,
      customerId: customer.id,
      make: 'Volvo',
      model: 'V70',
    },
    select: { id: true },
  });

  return { customerId: customer.id, vehicleId: vehicle.id };
}

export type SeedArticleOptions = {
  readonly salesPriceOre?: number;
  readonly vatRateBps?: number;
  readonly openingStock?: string;
  readonly minimumQuantity?: string;
};

/**
 * An article with an opening balance written through the ledger rather than
 * straight into the cached column — the cache is only ever written beside a
 * movement (§4.2), and a fixture that broke that rule would make the
 * deduction tests start from a state the application cannot produce.
 */
export async function seedArticle(
  harness: TestApp,
  userId: string,
  options: SeedArticleOptions = {},
): Promise<string> {
  const article = await harness.app.prisma.article.create({
    data: {
      sku: `WO-${crypto.randomUUID()}`,
      name: 'Motorolja 5W-30',
      unit: 'LITRE',
      salesPriceOre: options.salesPriceOre ?? 12_999,
      vatRateBps: options.vatRateBps ?? 2500,
      minimumQuantity: options.minimumQuantity ?? '0',
    },
    select: { id: true },
  });

  const opening = options.openingStock ?? '100';
  if (opening !== '0') {
    await harness.app.prisma.$transaction((tx) =>
      recordMovement(tx, {
        articleId: article.id,
        type: 'PURCHASE',
        amount: { kind: 'delta', value: parseQuantity(opening) },
        userId,
      }),
    );
  }

  return article.id;
}

export function post(
  harness: TestApp,
  agent: Agent,
  path: string,
  body: Record<string, unknown> = {},
): supertest.Test {
  return withAgent(supertest(harness.app.server).post(path), agent).send(body);
}

export function patch(
  harness: TestApp,
  agent: Agent,
  path: string,
  body: Record<string, unknown> = {},
): supertest.Test {
  return withAgent(supertest(harness.app.server).patch(path), agent).send(body);
}

export function del(
  harness: TestApp,
  agent: Agent,
  path: string,
): supertest.Test {
  return withAgent(supertest(harness.app.server).delete(path), agent);
}

export function get(
  harness: TestApp,
  agent: Agent,
  path: string,
): supertest.Test {
  return withAgent(supertest(harness.app.server).get(path), agent);
}

/** The line body most tests want: a stocked part, priced as the article is. */
export function partLine(
  articleId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'PART',
    articleId,
    description: 'Motorolja 5W-30',
    quantity: '4',
    unit: 'LITRE',
    unitPriceOre: 12_999,
    vatRateBps: 2500,
    ...overrides,
  };
}

/** A line with no article at all — labour, or a part from the loose box. */
export function labourLine(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    type: 'LABOUR',
    description: 'Service, 1 timme',
    quantity: '1',
    unit: 'HOUR',
    unitPriceOre: 89_500,
    vatRateBps: 2500,
    ...overrides,
  };
}
