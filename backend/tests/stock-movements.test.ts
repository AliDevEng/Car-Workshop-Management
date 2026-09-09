import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  articleSchema,
  paginatedResponseSchema,
  stockMovementResultSchema,
  stockMovementWithUserSchema,
  stocktakeResultSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B4.2 / B4.4 / B4.6 — stock movements over HTTP (PROJECT_SPEC.md §4.2, §6.4).
 *
 * Adjustments and stocktake are `ADMIN` (§5.3), audited, and never block a
 * negative balance. The per-article movement list answers "who, when and why".
 */

const movementListSchema = paginatedResponseSchema(stockMovementWithUserSchema);

let skuCounter = 0;

async function newArticle(
  harness: TestApp,
  admin: Agent,
  overrides: Record<string, unknown> = {},
): Promise<string> {
  skuCounter += 1;
  const response = await withAgent(
    supertest(harness.app.server).post('/api/articles'),
    admin,
  )
    .send({
      sku: `MOV-${String(skuCounter).padStart(4, '0')}`,
      name: 'Motorolja',
      unit: 'LITRE',
      salesPriceOre: 10_000,
      ...overrides,
    })
    .expect(201);
  return articleSchema.parse(jsonBody(response)).id;
}

function adjust(
  harness: TestApp,
  agent: Agent,
  articleId: string,
  body: Record<string, unknown>,
): supertest.Test {
  return withAgent(
    supertest(harness.app.server).post(
      `/api/articles/${articleId}/stock-adjustments`,
    ),
    agent,
  ).send(body);
}

describe('stock adjustments', () => {
  let harness: TestApp;
  let admin: Agent;
  let mechanic: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
    mechanic = await loginAs(harness, { role: 'MECHANIC' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('refuses an adjustment from a MECHANIC (§5.3)', async () => {
    const articleId = await newArticle(harness, admin);
    await adjust(harness, mechanic, articleId, {
      quantity: '5',
      note: 'Inleverans',
    }).expect(403);
  });

  it('applies a signed delta and updates the cached balance', async () => {
    const articleId = await newArticle(harness, admin);

    const response = await adjust(harness, admin, articleId, {
      quantity: '12.5',
      note: 'Inleverans från grossist',
    }).expect(201);

    const result = stockMovementResultSchema.parse(jsonBody(response));
    expect(result.movement.type).toBe('ADJUSTMENT');
    expect(result.movement.quantity).toBe('12.5');
    expect(result.movement.balanceAfter).toBe('12.5');
    expect(result.warnings).toEqual([]);

    const article = articleSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/articles/${articleId}`)
          .set('cookie', admin.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(article.stockQuantity).toBe('12.5');
  });

  it('records the adjustment in the audit log', async () => {
    const articleId = await newArticle(harness, admin);
    await adjust(harness, admin, articleId, {
      quantity: '3',
      note: 'Justering',
    }).expect(201);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'stock.adjusted', entityId: articleId },
    });
    expect(entry?.entityType).toBe('Article');
    expect(entry?.afterJson).toMatchObject({ stockQuantity: '3' });
  });

  it('warns but does not block when the balance goes negative', async () => {
    const articleId = await newArticle(harness, admin);

    const response = await adjust(harness, admin, articleId, {
      quantity: '-4',
      note: 'Förbrukning som inte bokförts',
    }).expect(201);

    const result = stockMovementResultSchema.parse(jsonBody(response));
    expect(result.movement.balanceAfter).toBe('-4');
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain('under noll');
  });

  it('rejects a zero adjustment with a field message', async () => {
    const articleId = await newArticle(harness, admin);
    const response = await adjust(harness, admin, articleId, {
      quantity: '0',
      note: 'Ingen förändring',
    }).expect(400);
    expect(JSON.stringify(apiErrorSchema.parse(jsonBody(response)))).toContain(
      'skild från noll',
    );
  });

  it('rejects a quantity with four decimals before it reaches the ledger', async () => {
    const articleId = await newArticle(harness, admin);
    await adjust(harness, admin, articleId, {
      quantity: '1.2345',
      note: 'För precist',
    }).expect(400);
  });

  it('answers 404 for an unknown article', async () => {
    await adjust(harness, admin, '01900000-0000-7000-8000-000000000000', {
      quantity: '1',
      note: 'x',
    }).expect(404);
  });
});

describe('stocktake', () => {
  let harness: TestApp;
  let admin: Agent;
  let mechanic: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
    mechanic = await loginAs(harness, { role: 'MECHANIC' });
  });

  afterAll(async () => {
    await harness.close();
  });

  function stocktake(
    agent: Agent,
    articleId: string,
    body: Record<string, unknown>,
  ): supertest.Test {
    return withAgent(
      supertest(harness.app.server).post(
        `/api/articles/${articleId}/stocktake`,
      ),
      agent,
    ).send(body);
  }

  it('refuses a stocktake from a MECHANIC (B4.4.3)', async () => {
    const articleId = await newArticle(harness, admin);
    await stocktake(mechanic, articleId, { countedQuantity: '5' }).expect(403);
  });

  it('writes a STOCKTAKE movement for the difference and returns the delta', async () => {
    const articleId = await newArticle(harness, admin);
    await adjust(harness, admin, articleId, {
      quantity: '10',
      note: 'Start',
    }).expect(201);

    const response = await stocktake(admin, articleId, {
      countedQuantity: '7.5',
      note: 'Årsinventering',
    }).expect(201);

    const result = stocktakeResultSchema.parse(jsonBody(response));
    expect(result.movement.type).toBe('STOCKTAKE');
    expect(result.differenceQuantity).toBe('-2.5');
    expect(result.balanceAfter).toBe('7.5');
    expect(result.movement.quantity).toBe('-2.5');

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'stock.stocktake', entityId: articleId },
    });
    expect(entry?.afterJson).toMatchObject({
      stockQuantity: '7.5',
      differenceQuantity: '-2.5',
    });
  });

  it('handles a count that matches the balance (zero difference)', async () => {
    const articleId = await newArticle(harness, admin);
    const response = await stocktake(admin, articleId, {
      countedQuantity: '0',
    }).expect(201);
    expect(
      stocktakeResultSchema.parse(jsonBody(response)).differenceQuantity,
    ).toBe('0');
  });

  it('rejects a negative counted quantity', async () => {
    const articleId = await newArticle(harness, admin);
    await stocktake(admin, articleId, { countedQuantity: '-1' }).expect(400);
  });
});

describe('the per-article movement list (B4.2.4)', () => {
  let harness: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('lists movements newest first with who and why', async () => {
    const articleId = await newArticle(harness, admin);
    await adjust(harness, admin, articleId, {
      quantity: '10',
      note: 'Inleverans',
    }).expect(201);
    await adjust(harness, admin, articleId, {
      quantity: '-2',
      note: 'Svinn',
    }).expect(201);

    const response = await supertest(harness.app.server)
      .get(`/api/articles/${articleId}/movements`)
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    const page = movementListSchema.parse(jsonBody(response));
    expect(page.data.map((movement) => movement.note)).toEqual([
      'Svinn',
      'Inleverans',
    ]);
    expect(page.data[0]?.user.id).toBe(admin.userId);
    expect(page.data[0]?.balanceAfter).toBe('8');
  });

  it('filters by movement type', async () => {
    const articleId = await newArticle(harness, admin);
    await adjust(harness, admin, articleId, {
      quantity: '10',
      note: 'Inleverans',
    }).expect(201);
    await withAgent(
      supertest(harness.app.server).post(
        `/api/articles/${articleId}/stocktake`,
      ),
      admin,
    )
      .send({ countedQuantity: '9' })
      .expect(201);

    const response = await supertest(harness.app.server)
      .get(`/api/articles/${articleId}/movements?type=STOCKTAKE`)
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    const page = movementListSchema.parse(jsonBody(response));
    expect(page.data).toHaveLength(1);
    expect(page.data[0]?.type).toBe('STOCKTAKE');
  });

  it('answers 404 for an unknown article', async () => {
    await supertest(harness.app.server)
      .get('/api/articles/01900000-0000-7000-8000-000000000000/movements')
      .set('cookie', admin.cookies.join('; '))
      .expect(404);
  });
});
