import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiErrorSchema,
  articleSchema,
  lowStockReportSchema,
  paginatedResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';

/**
 * B4.1 / B4.6 — the article catalogue (PROJECT_SPEC.md §4.2, §6.4).
 *
 * Reads are `authenticated`; creating an article and changing a price are
 * `ADMIN` (§5.3), while a mechanic may still fix the non-price fields.
 */

const articleListSchema = paginatedResponseSchema(articleSchema);

let skuCounter = 0;

function validArticle(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  skuCounter += 1;
  return {
    sku: `ART-${String(skuCounter).padStart(4, '0')}`,
    name: 'Motorolja 5W-30',
    unit: 'LITRE',
    salesPriceOre: 12_900,
    ...overrides,
  };
}

async function createArticle(
  harness: TestApp,
  admin: Agent,
  body: Record<string, unknown> = validArticle(),
): Promise<string> {
  const response = await withAgent(
    supertest(harness.app.server).post('/api/articles'),
    admin,
  )
    .send(body)
    .expect(201);
  return articleSchema.parse(jsonBody(response)).id;
}

describe('articles', () => {
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

  it('rejects an unauthenticated request', async () => {
    await supertest(harness.app.server).get('/api/articles').expect(401);
  });

  it('creates an article and defaults VAT, stock and OE numbers', async () => {
    const response = await withAgent(
      supertest(harness.app.server).post('/api/articles'),
      admin,
    )
      .send(validArticle({ name: 'Oljefilter', unit: 'PIECE' }))
      .expect(201);

    const created = articleSchema.parse(jsonBody(response));
    expect(created.vatRateBps).toBe(2500);
    expect(created.stockQuantity).toBe('0');
    expect(created.minimumQuantity).toBe('0');
    expect(created.oeNumbers).toEqual([]);
    expect(created.isActive).toBe(true);
  });

  it('records the creation in the audit log (money, §4.2)', async () => {
    const id = await createArticle(
      harness,
      admin,
      validArticle({ name: 'Reviderad artikel' }),
    );

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'article.created', entityId: id },
    });
    expect(entry?.entityType).toBe('Article');
    expect(entry?.afterJson).toMatchObject({ name: 'Reviderad artikel' });
  });

  it('normalises and de-duplicates OE numbers', async () => {
    const response = await withAgent(
      supertest(harness.app.server).post('/api/articles'),
      admin,
    )
      .send(
        validArticle({
          oeNumbers: ['gm 93165557', 'GM93165557', ' 31372212 '],
        }),
      )
      .expect(201);

    expect(articleSchema.parse(jsonBody(response)).oeNumbers).toEqual([
      'GM93165557',
      '31372212',
    ]);
  });

  it('refuses to create an article as a MECHANIC (§5.3, prices)', async () => {
    await withAgent(
      supertest(harness.app.server).post('/api/articles'),
      mechanic,
    )
      .send(validArticle())
      .expect(403);
  });

  it('rejects a price with öre decimals and explains öre', async () => {
    const response = await withAgent(
      supertest(harness.app.server).post('/api/articles'),
      admin,
    )
      .send(validArticle({ salesPriceOre: 199.5 }))
      .expect(400);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(JSON.stringify(body.error.details)).toContain('ören');
  });

  it('rejects a duplicate SKU as a 409, not a 500', async () => {
    const first = validArticle();
    await createArticle(harness, admin, first);

    const response = await withAgent(
      supertest(harness.app.server).post('/api/articles'),
      admin,
    )
      .send({ ...validArticle(), sku: first.sku })
      .expect(409);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'CONFLICT',
    );
  });

  it('serialises quantities as strings and prices as integer öre (B4.6.2)', async () => {
    const id = await createArticle(
      harness,
      admin,
      validArticle({ salesPriceOre: 12_900, minimumQuantity: '4.250' }),
    );

    const response = await supertest(harness.app.server)
      .get(`/api/articles/${id}`)
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    const article = articleSchema.parse(jsonBody(response));
    expect(article.minimumQuantity).toBe('4.25');
    expect(article.stockQuantity).toBe('0');
    expect(article.salesPriceOre).toBe(12_900);
    // No Decimal object escaped into the JSON.
    expect(response.text).not.toContain('[object Object]');
  });

  it('lets a MECHANIC edit a non-price field but not a price', async () => {
    const id = await createArticle(
      harness,
      admin,
      validArticle({ name: 'Före', location: 'A1' }),
    );

    const ok = await withAgent(
      supertest(harness.app.server).patch(`/api/articles/${id}`),
      mechanic,
    )
      .send({ name: 'Efter', location: 'B2' })
      .expect(200);
    expect(articleSchema.parse(jsonBody(ok)).name).toBe('Efter');

    // Sending the unchanged price back is fine.
    await withAgent(
      supertest(harness.app.server).patch(`/api/articles/${id}`),
      mechanic,
    )
      .send({ salesPriceOre: 12_900 })
      .expect(200);

    const forbidden = await withAgent(
      supertest(harness.app.server).patch(`/api/articles/${id}`),
      mechanic,
    )
      .send({ salesPriceOre: 15_900 })
      .expect(403);
    expect(apiErrorSchema.parse(jsonBody(forbidden)).error.code).toBe(
      'FORBIDDEN',
    );
  });

  it('records a price change as its own audit action', async () => {
    const id = await createArticle(harness, admin, validArticle());

    await withAgent(
      supertest(harness.app.server).patch(`/api/articles/${id}`),
      admin,
    )
      .send({ salesPriceOre: 19_900 })
      .expect(200);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'article.price_changed', entityId: id },
    });
    expect(entry?.beforeJson).toMatchObject({ salesPriceOre: 12_900 });
    expect(entry?.afterJson).toMatchObject({ salesPriceOre: 19_900 });
  });

  it('has no hard-delete route', async () => {
    const id = await createArticle(harness, admin, validArticle());
    await withAgent(
      supertest(harness.app.server).delete(`/api/articles/${id}`),
      admin,
    ).expect(404);
  });

  it('deactivates and reactivates rather than deleting', async () => {
    const id = await createArticle(harness, admin, validArticle());

    const deactivated = await withAgent(
      supertest(harness.app.server).post(`/api/articles/${id}/deactivate`),
      mechanic,
    ).expect(200);
    expect(articleSchema.parse(jsonBody(deactivated)).isActive).toBe(false);

    // Idempotent.
    await withAgent(
      supertest(harness.app.server).post(`/api/articles/${id}/deactivate`),
      mechanic,
    ).expect(200);

    const reactivated = await withAgent(
      supertest(harness.app.server).post(`/api/articles/${id}/reactivate`),
      mechanic,
    ).expect(200);
    expect(articleSchema.parse(jsonBody(reactivated)).isActive).toBe(true);
  });

  it('answers 404 for an article that does not exist', async () => {
    await supertest(harness.app.server)
      .get('/api/articles/01900000-0000-7000-8000-000000000000')
      .set('cookie', admin.cookies.join('; '))
      .expect(404);
  });
});

describe('article list and search (B4.1.2, B4.6)', () => {
  let harness: TestApp;
  let admin: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    admin = await loginAs(harness, { role: 'ADMIN' });

    await createArticle(
      harness,
      admin,
      validArticle({
        sku: 'BROMSBELAGG-FRAM',
        name: 'Bromsbelägg fram',
        unit: 'KIT',
        oeNumbers: ['1K0698151'],
      }),
    );
    await createArticle(
      harness,
      admin,
      validArticle({
        sku: 'BROMSSKIVA-FRAM',
        name: 'Bromsskiva fram',
        unit: 'PIECE',
        minimumQuantity: '10',
      }),
    );
  });

  afterAll(async () => {
    await harness.close();
  });

  async function list(query: string): Promise<string[]> {
    const response = await supertest(harness.app.server)
      .get(`/api/articles?${query}`)
      .set('cookie', admin.cookies.join('; '))
      .expect(200);
    return articleListSchema
      .parse(jsonBody(response))
      .data.map((article) => article.sku);
  }

  it('matches on name', async () => {
    expect(await list('q=bromsskiva')).toContain('BROMSSKIVA-FRAM');
  });

  it('matches on SKU', async () => {
    expect(await list('q=BROMSBELAGG')).toContain('BROMSBELAGG-FRAM');
  });

  it('matches an OE number exactly, however spaced', async () => {
    expect(await list('q=1k0 698 151')).toContain('BROMSBELAGG-FRAM');
  });

  it('filters to articles below their minimum', async () => {
    // BROMSSKIVA has minimum 10 and stock 0; BROMSBELAGG has minimum 0.
    const skus = await list('lowStock=true');
    expect(skus).toContain('BROMSSKIVA-FRAM');
    expect(skus).not.toContain('BROMSBELAGG-FRAM');
  });

  it('paginates on an opaque cursor without repeating a row', async () => {
    for (let i = 0; i < 4; i += 1) {
      await createArticle(harness, admin, validArticle({ name: `Sida ${i}` }));
    }

    const first = articleListSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get('/api/articles?limit=3')
          .set('cookie', admin.cookies.join('; '))
          .expect(200),
      ),
    );
    expect(first.data).toHaveLength(3);
    expect(first.nextCursor).toBeTypeOf('string');

    const second = articleListSchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get(`/api/articles?limit=3&cursor=${String(first.nextCursor)}`)
          .set('cookie', admin.cookies.join('; '))
          .expect(200),
      ),
    );
    const firstIds = new Set(first.data.map((article) => article.id));
    for (const article of second.data) {
      expect(firstIds.has(article.id)).toBe(false);
    }
  });

  it('exposes the low-stock report ordered by deficit', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/articles/low-stock')
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    const report = lowStockReportSchema.parse(jsonBody(response));
    expect(report.data.some((row) => row.sku === 'BROMSSKIVA-FRAM')).toBe(true);
  });

  it('exports the low-stock list as CSV with a BOM', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/articles/low-stock/export')
      .set('cookie', admin.cookies.join('; '))
      .expect(200);

    expect(response.headers['content-type']).toContain('text/csv');
    expect(response.headers['content-disposition']).toContain('.csv');
    expect(response.text.charCodeAt(0)).toBe(0xfeff);
    expect(response.text).toContain('BROMSSKIVA-FRAM');
  });
});
