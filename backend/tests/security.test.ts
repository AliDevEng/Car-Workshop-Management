import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiErrorSchema } from 'shared';
import { z } from 'zod';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { CSRF_EXEMPT_ROUTES } from '../src/plugins/csrf.js';

/**
 * §5.4 baseline measures, and the one CSRF exemption §5.2 allows.
 *
 * Each of these is a control that would fail silently rather than loudly, so
 * each is asserted rather than assumed.
 */

describe('the global rate limit', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ database: 'none' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('answers in the §3.7 envelope rather than the plugin’s own English JSON', async () => {
    let last = await supertest(harness.app.server).get('/api/health');

    for (let attempt = 0; attempt < 400 && last.status !== 429; attempt += 1) {
      last = await supertest(harness.app.server).get('/api/health');
    }

    expect(last.status).toBe(429);

    // `@fastify/rate-limit` builds its own body unless the error is routed
    // through the domain hierarchy. Without that, a throttled caller gets
    // English text and no requestId, which is the one thing the envelope
    // exists to prevent.
    const body = apiErrorSchema.parse(jsonBody(last));
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(body.error.message).toBe(
      'För många försök. Vänta en stund och försök igen.',
    );
    expect(body.error.requestId).toBeTypeOf('string');
  });
});

describe('security headers', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ database: 'none' });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('sets helmet’s headers on API responses', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/health')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not set a Content-Security-Policy here', async () => {
    // The CSP that protects users is the one on HTML documents, and those are
    // served by Next (§5.4). Setting a strict one on JSON responses and
    // assuming the site is covered is the mistake the spec names.
    const response = await supertest(harness.app.server)
      .get('/api/health')
      .expect(200);

    expect(response.headers['content-security-policy']).toBeUndefined();
  });
});

describe('the CSRF allow-list (§5.2)', () => {
  it('contains only the public booking endpoint', () => {
    // The list is the entire exemption surface of the system. A second entry
    // is a decision that should be visible in a diff.
    expect(CSRF_EXEMPT_ROUTES).toEqual(['POST /api/public/booking-requests']);
  });

  it('lets that one route through without a token', async () => {
    // The real B5 endpoint, reached with no CSRF header at all. An empty body
    // fails validation, and that is the point: a `400` means the request got
    // past the CSRF hook and into the route, whereas a `403` would mean the
    // exemption had quietly stopped working and the public form was dead.
    const harness = await createTestApp({ database: 'none' });

    const response = await supertest(harness.app.server)
      .post('/api/public/booking-requests')
      .send({})
      .expect(400);
    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'VALIDATION_FAILED',
    );

    await harness.close();
  });

  it('does not exempt a neighbouring public route', async () => {
    // §5.2 forbids exempting by prefix. `/api/public/...` is not a licence.
    const harness = await createTestApp({
      database: 'none',
      register: (app) => {
        app.post(
          '/api/public/something-else',
          {
            config: { auth: 'public' },
            schema: { response: { 200: z.object({ ok: z.literal(true) }) } },
          },
          () => ({ ok: true as const }),
        );
      },
    });

    await supertest(harness.app.server)
      .post('/api/public/something-else')
      .send({})
      .expect(403);

    await harness.close();
  });
});

describe('client address resolution', () => {
  /**
   * Asserted through `request.ip` itself rather than through Fastify's
   * `initialConfig`, because `request.ip` is the value everything downstream
   * actually uses: the per-IP login limit (§5.1), the global limit (§5.4) and
   * the stored `ipHash` (§5.5).
   */
  async function clientIpSeenBy(
    trustProxy: boolean,
    forwardedFor: string,
  ): Promise<string> {
    const harness = await createTestApp({
      database: 'none',
      ...(trustProxy ? { env: { TRUST_PROXY: 'true' } } : {}),
      register: (app) => {
        app.get(
          '/test/security/ip',
          {
            config: { auth: 'public' },
            schema: { response: { 200: z.object({ ip: z.string() }) } },
          },
          (request) => ({ ip: request.ip }),
        );
      },
    });

    try {
      const response = await supertest(harness.app.server)
        .get('/test/security/ip')
        .set('x-forwarded-for', forwardedFor)
        .expect(200);

      return z.object({ ip: z.string() }).parse(jsonBody(response)).ip;
    } finally {
      await harness.close();
    }
  }

  it('ignores X-Forwarded-For by default', async () => {
    // Trusting the header with nothing in front to overwrite it would let a
    // caller pick their own rate-limit bucket and their own stored ipHash.
    expect(await clientIpSeenBy(false, '203.0.113.7')).not.toBe('203.0.113.7');
  });

  it('reads it when TRUST_PROXY is on, which is what B12 deploys', async () => {
    // Without this, every request behind Caddy (§2.3) carries the proxy's
    // address, and three separate controls silently describe one client.
    expect(await clientIpSeenBy(true, '203.0.113.7')).toBe('203.0.113.7');
  });
});
