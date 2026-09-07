import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { apiErrorSchema } from 'shared';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
} from '../src/lib/errors.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';

/**
 * B0.7.6 — one assertion per case in the §3.7 envelope. These routes exist
 * only inside this file; nothing in the application throws to prove a point.
 */

/** Mimics Prisma without importing the generated client (see lib/prisma-errors). */
function prismaError(code: string, meta?: Record<string, unknown>): Error {
  const error = new Error(`Prisma error ${code}`);
  error.name = 'PrismaClientKnownRequestError';
  return Object.assign(error, meta === undefined ? { code } : { code, meta });
}

function registerThrowingRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.post(
    '/test/validate',
    {
      schema: {
        body: z.object({ email: z.email(), age: z.number().int().min(0) }),
        response: { 200: z.object({ ok: z.literal(true) }) },
      },
    },
    () => ({ ok: true as const }),
  );

  const thrown = {
    validation: () =>
      new ValidationError('Fältet saknas.', { details: { field: 'phone' } }),
    unauthorized: () => new UnauthorizedError(),
    forbidden: () => new ForbiddenError(),
    'not-found': () => new NotFoundError(),
    conflict: () => new ConflictError(),
    'rate-limit': () => new RateLimitError(),
    'prisma-unique': () => prismaError('P2002', { target: ['email'] }),
    'prisma-missing': () => prismaError('P2025'),
    unexpected: () => new Error('Database password is hunter2'),
  } as const;

  for (const [name, create] of Object.entries(thrown)) {
    routes.get(`/test/throw/${name}`, () => {
      throw create();
    });
  }

  // `throw 'string'` is legal JavaScript and a rejected promise can carry any
  // value. The handler must still produce the envelope rather than throwing
  // inside itself.
  routes.get('/test/throw/primitive', () => {
    // Throwing a non-Error is the entire point of this route: the adapter's
    // own type guards use `in` without a typeof check and would throw a
    // TypeError inside the error handler.
    // eslint-disable-next-line @typescript-eslint/only-throw-error
    throw 'a bare string';
  });
}

describe('error envelope', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({
      database: 'none',
      register: registerThrowingRoutes,
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const cases: readonly [path: string, status: number, code: string][] = [
    ['validation', 400, 'VALIDATION_FAILED'],
    ['unauthorized', 401, 'UNAUTHORIZED'],
    ['forbidden', 403, 'FORBIDDEN'],
    ['not-found', 404, 'NOT_FOUND'],
    ['conflict', 409, 'CONFLICT'],
    ['rate-limit', 429, 'RATE_LIMITED'],
    ['prisma-unique', 409, 'CONFLICT'],
    ['prisma-missing', 404, 'NOT_FOUND'],
    ['unexpected', 500, 'INTERNAL_ERROR'],
    ['primitive', 500, 'INTERNAL_ERROR'],
  ];

  it.each(cases)(
    '%s maps to %i %s in the envelope',
    async (name, status, code) => {
      const response = await supertest(harness.app.server)
        .get(`/test/throw/${name}`)
        .expect(status);

      const body = apiErrorSchema.parse(jsonBody(response));
      expect(body.error.code).toBe(code);
      expect(body.error.message.length).toBeGreaterThan(0);
      expect(body.error.requestId).toBe(response.headers['x-request-id']);
    },
  );

  it('never leaks an unexpected error message to the client', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/throw/unexpected')
      .expect(500);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.message).not.toContain('hunter2');
    expect(JSON.stringify(jsonBody(response))).not.toContain('at Object');
  });

  it('names the columns behind a unique-constraint conflict', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/throw/prisma-unique')
      .expect(409);

    expect(jsonBody(response)).toMatchObject({
      error: { details: { fields: ['email'] } },
    });
  });

  it('reports Zod request-validation failures per field', async () => {
    const response = await supertest(harness.app.server)
      .post('/test/validate')
      .send({ email: 'not-an-email', age: -1 })
      .expect(400);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.code).toBe('VALIDATION_FAILED');

    const details = z
      .array(z.object({ path: z.string(), message: z.string() }))
      .parse(body.error.details);

    expect(details.map((issue) => issue.path).sort()).toEqual(['age', 'email']);
  });

  it('accepts a body that satisfies the schema', async () => {
    await supertest(harness.app.server)
      .post('/test/validate')
      .send({ email: 'anna@example.se', age: 42 })
      .expect(200, { ok: true });
  });

  it('returns the envelope for an unknown route', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/does-not-exist')
      .expect(404);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'NOT_FOUND',
    );
  });

  it('returns the envelope for a malformed JSON body', async () => {
    const response = await supertest(harness.app.server)
      .post('/test/validate')
      .set('content-type', 'application/json')
      .send('{"email":')
      .expect(400);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'VALIDATION_FAILED',
    );
  });
});
