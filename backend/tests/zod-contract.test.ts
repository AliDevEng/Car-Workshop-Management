import { Decimal } from 'decimal.js';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { decimalToString, isValidDecimalString } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';

/**
 * B0.5.6 and B0.5.7.
 *
 * Fastify validates and serialises with JSON Schema, not Zod. Attaching a Zod
 * object to `schema.response` without the adapter's compilers silently does
 * nothing — the response is emitted unchecked and the mistake is invisible.
 * These tests fail if either compiler is ever dropped from `app.ts`.
 */

/** Stands in for a repository row until B4 has a real Article. */
const stockLineSchema = z.object({
  sku: z.string(),
  // Quantities cross the JSON boundary as strings (PROJECT_SPEC.md §3.4).
  quantity: z.string().refine(isValidDecimalString, 'not a decimal string'),
  salesPriceOre: z.number().int(),
});

function registerContractRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/test/contract/echo',
    {
      schema: {
        body: stockLineSchema,
        response: { 200: stockLineSchema },
      },
    },
    (request) => request.body,
  );

  // A repository maps Decimal to string before returning (§8.2).
  routes.get(
    '/test/contract/mapped',
    { schema: { response: { 200: stockLineSchema } } },
    () => ({
      sku: 'OIL-5W30-1L',
      quantity: decimalToString(new Decimal('4.250')),
      salesPriceOre: 12_900,
    }),
  );

  // The same row returned without that mapping. Registered on the untyped
  // instance on purpose: with the type provider this is a compile error, which
  // is the first line of defence — the test exists to prove the *runtime* also
  // refuses, rather than emitting "[object Object]" into a customer's PDF.
  app.get(
    '/test/contract/unmapped',
    { schema: { response: { 200: z.object({ quantity: z.string() }) } } },
    () => ({ quantity: new Decimal('4.250') }),
  );

  routes.get(
    '/test/contract/leaky',
    {
      schema: {
        response: { 200: z.object({ email: z.string() }) },
      },
    },
    () => ({ email: 'anna@example.se', passwordHash: 'argon2id$secret' }),
  );
}

describe('shared Zod schemas drive both directions', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({
      database: 'none',
      register: registerContractRoutes,
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('validates a request body against the schema', async () => {
    await supertest(harness.app.server)
      .post('/test/contract/echo')
      .send({ sku: 'OIL-5W30-1L', quantity: '4.250', salesPriceOre: 12_900 })
      .expect(200, {
        sku: 'OIL-5W30-1L',
        quantity: '4.250',
        salesPriceOre: 12_900,
      });
  });

  it('rejects a quantity that is a number rather than a decimal string', async () => {
    await supertest(harness.app.server)
      .post('/test/contract/echo')
      .send({ sku: 'OIL-5W30-1L', quantity: 4.25, salesPriceOre: 12_900 })
      .expect(400);
  });

  it('rejects a price expressed in kronor instead of öre', async () => {
    await supertest(harness.app.server)
      .post('/test/contract/echo')
      .send({ sku: 'OIL-5W30-1L', quantity: '4.250', salesPriceOre: 129.5 })
      .expect(400);
  });

  it('serialises a repository-mapped Decimal as a string', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/contract/mapped')
      .expect(200);

    const body = stockLineSchema.parse(jsonBody(response));
    expect(body).toEqual({
      sku: 'OIL-5W30-1L',
      quantity: '4.25',
      salesPriceOre: 12_900,
    });
    expect(typeof body.quantity).toBe('string');
  });

  it('fails loudly when a Decimal reaches the serialiser unmapped', async () => {
    const response = await supertest(harness.app.server).get(
      '/test/contract/unmapped',
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(jsonBody(response))).not.toContain('[object Object]');
  });

  it('strips a field the response schema does not declare', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/contract/leaky')
      .expect(200);

    expect(jsonBody(response)).toEqual({ email: 'anna@example.se' });
    expect(jsonBody(response)).not.toHaveProperty('passwordHash');
  });
});
