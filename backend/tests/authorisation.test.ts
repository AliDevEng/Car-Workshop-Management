import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { apiErrorSchema } from 'shared';
import { z } from 'zod';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs } from './helpers/auth.js';

/**
 * B2.4 — every route declares its authorisation, and the declaration is what
 * installs the guard (PROJECT_SPEC.md §5.3).
 *
 * This file also carries B2's Definition of Done: an unauthenticated request
 * to a protected route is a 401, and a `MECHANIC` on an `ADMIN` route is a 403.
 */

function registerProbeRoutes(app: FastifyInstance): void {
  const ok = z.object({ ok: z.literal(true) });

  app.get(
    '/test/auth/public',
    { config: { auth: 'public' }, schema: { response: { 200: ok } } },
    () => ({ ok: true as const }),
  );

  app.get(
    '/test/auth/authenticated',
    { config: { auth: 'authenticated' }, schema: { response: { 200: ok } } },
    () => ({ ok: true as const }),
  );

  app.get(
    '/test/auth/admin',
    { config: { auth: { role: 'ADMIN' } }, schema: { response: { 200: ok } } },
    () => ({ ok: true as const }),
  );
}

describe('route authorisation', () => {
  let harness: TestApp;

  beforeAll(async () => {
    harness = await createTestApp({ register: registerProbeRoutes });
  });

  afterAll(async () => {
    await harness.close();
  });

  it('lets anyone reach a public route', async () => {
    await supertest(harness.app.server).get('/test/auth/public').expect(200);
  });

  it('answers 401 in the §3.7 envelope for an unauthenticated request', async () => {
    const response = await supertest(harness.app.server)
      .get('/test/auth/authenticated')
      .expect(401);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.code).toBe('UNAUTHORIZED');
    expect(body.error.message).toBe('Du måste logga in för att fortsätta.');
    expect(body.error.requestId).toBeTypeOf('string');
  });

  it('lets any signed-in user reach an authenticated route', async () => {
    const agent = await loginAs(harness, { role: 'MECHANIC' });

    await supertest(harness.app.server)
      .get('/test/auth/authenticated')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
  });

  it('answers 403 when a MECHANIC hits an ADMIN route', async () => {
    const agent = await loginAs(harness, { role: 'MECHANIC' });

    const response = await supertest(harness.app.server)
      .get('/test/auth/admin')
      .set('cookie', agent.cookies.join('; '))
      .expect(403);

    const body = apiErrorSchema.parse(jsonBody(response));
    expect(body.error.code).toBe('FORBIDDEN');
    expect(body.error.message).toBe('Du har inte behörighet att göra detta.');
  });

  it('answers 401, not 403, when nobody is signed in at all', async () => {
    // The distinction matters to the UI: 401 means "log in", 403 means "you
    // are logged in as the wrong person". Collapsing them sends a mechanic to
    // a login screen they are already past.
    const response = await supertest(harness.app.server)
      .get('/test/auth/admin')
      .expect(401);

    expect(apiErrorSchema.parse(jsonBody(response)).error.code).toBe(
      'UNAUTHORIZED',
    );
  });

  it('lets an ADMIN through', async () => {
    const agent = await loginAs(harness, { role: 'ADMIN' });

    await supertest(harness.app.server)
      .get('/test/auth/admin')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);
  });

  it('guards the auto-generated HEAD route as well as its GET', async () => {
    // Fastify adds a HEAD for every GET. It is the same resource, so an
    // unguarded one would be a back door that answers with headers alone.
    await supertest(harness.app.server).head('/test/auth/admin').expect(401);
  });
});

describe('the startup assertion (B2.4.3)', () => {
  it('refuses to boot when a route has no auth declaration', async () => {
    await expect(
      createTestApp({
        database: 'none',
        register: (app) => {
          app.get('/test/auth/undeclared', () => ({ ok: true }));
        },
      }),
    ).rejects.toThrow(/without an auth declaration/);
  });

  it('names every offending route, not just the first', async () => {
    // A whole module written without declarations should produce one error a
    // developer can act on, rather than a fix-and-rerun loop.
    await expect(
      createTestApp({
        database: 'none',
        register: (app) => {
          app.get('/test/auth/first', () => ({ ok: true }));
          app.post('/test/auth/second', () => ({ ok: true }));
        },
      }),
    ).rejects.toThrow(/first[\s\S]*second/);
  });

  it('boots cleanly when every route declares one', async () => {
    const harness = await createTestApp({
      database: 'none',
      register: (app) => {
        app.get('/test/auth/declared', { config: { auth: 'public' } }, () => ({
          ok: true,
        }));
      },
    });

    await supertest(harness.app.server).get('/test/auth/declared').expect(200);
    await harness.close();
  });
});
