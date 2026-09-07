import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { healthReadyResponseSchema, healthResponseSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';

/**
 * B0's Definition of Done: `GET /api/health` returns
 * `{ status: 'ok', version, uptime }`, and readiness actually reaches the
 * database rather than reporting on itself.
 */
describe('health endpoints', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp();
  });

  afterAll(async () => {
    await harness.close();
  });

  it('reports liveness in the shape shared/ declares', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/health')
      .expect(200)
      .expect('content-type', /application\/json/);

    // Parsed with the same schema the frontend uses, so a drift between the
    // handler and the contract fails here rather than in the browser.
    const body = healthResponseSchema.parse(jsonBody(response));
    expect(body.status).toBe('ok');
    expect(body.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('echoes a generated request id on every response', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/health')
      .expect(200);

    expect(response.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('adopts a caller-supplied request id when it is safe', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/health')
      .set('x-request-id', 'trace-from-caddy-01')
      .expect(200);

    expect(response.headers['x-request-id']).toBe('trace-from-caddy-01');
  });

  it('replaces a request id that could poison a log line', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/health')
      .set('x-request-id', 'a'.repeat(400))
      .expect(200);

    expect(response.headers['x-request-id']).not.toContain('aaaa');
  });

  it('reaches the database for readiness', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/health/ready')
      .expect(200);

    expect(healthReadyResponseSchema.parse(jsonBody(response))).toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('reports 503 in the error envelope when the database is gone', async () => {
    const unreachable = await createTestApp({ database: 'none' });
    try {
      const response = await supertest(unreachable.app.server)
        .get('/api/health/ready')
        .expect(503);

      expect(jsonBody(response)).toMatchObject({
        error: { code: 'SERVICE_UNAVAILABLE' },
      });
    } finally {
      await unreachable.close();
    }
  });
});
