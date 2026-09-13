import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  serviceRuleImportResponseSchema,
  serviceRuleListResponseSchema,
  serviceRulePreviewResponseSchema,
  serviceRuleResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { get, patch, post } from './helpers/work-orders.js';

/**
 * Service rules end to end (B9.1, B9.2.3's no-match case aside — the pure
 * matching/due-date logic has its own exhaustive suite in
 * `shared/tests/service-rules.test.ts`; this file covers the CRUD surface,
 * validation, authorisation and the CSV/preview endpoints around it).
 */

let harness: TestApp;
let admin: Agent;

beforeAll(async () => {
  harness = await createTestApp();
  admin = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
});

function rule(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    make: 'Volvo',
    serviceType: 'SERVICE_A',
    intervalKm: 15_000,
    intervalMonths: 12,
    sourceNote: 'Volvo servicehäfte 2019',
    ...overrides,
  };
}

describe('B9.1 — creating and listing rules', () => {
  it('creates a rule', async () => {
    const response = await post(
      harness,
      admin,
      '/api/service-rules',
      rule(),
    ).expect(201);

    const { rule: created } = serviceRuleResponseSchema.parse(
      jsonBody(response),
    );
    expect(created.isActive).toBe(true);
    expect(created.make).toBe('Volvo');
    expect(created.createdByUserId).toBe(admin.userId);
  });

  it('rejects a rule with neither a km nor a month interval', async () => {
    await post(
      harness,
      admin,
      '/api/service-rules',
      rule({ intervalKm: undefined, intervalMonths: undefined }),
    ).expect(400);
  });

  it('rejects a year range that starts after it ends', async () => {
    await post(
      harness,
      admin,
      '/api/service-rules',
      rule({ modelYearFrom: 2020, modelYearTo: 2010 }),
    ).expect(400);
  });

  it('allows two overlapping rules for the same make and service type (B9.1.3)', async () => {
    await post(harness, admin, '/api/service-rules', rule()).expect(201);
    await post(
      harness,
      admin,
      '/api/service-rules',
      rule({ model: 'V70' }),
    ).expect(201);
    // Neither call conflicted; specificity is resolved by the matching
    // engine, not by a database constraint.
  });

  it('lists rules and filters by make and service type', async () => {
    await post(
      harness,
      admin,
      '/api/service-rules',
      rule({ make: 'SEEDFILTER', serviceType: 'TIMING_BELT' }),
    ).expect(201);

    const list = serviceRuleListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          '/api/service-rules?make=SEEDFILTER&serviceType=TIMING_BELT',
        ).expect(200),
      ),
    );

    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((r) => r.make === 'SEEDFILTER')).toBe(true);
  });

  it('404s for a rule that does not exist', async () => {
    await get(
      harness,
      admin,
      '/api/service-rules/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });
});

describe('B9.1 — editing a rule', () => {
  it('updates narrowing fields, including clearing one to null', async () => {
    const created = serviceRuleResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          '/api/service-rules',
          rule({ model: 'V70' }),
        ).expect(201),
      ),
    );

    const updated = serviceRuleResponseSchema.parse(
      jsonBody(
        await patch(harness, admin, `/api/service-rules/${created.rule.id}`, {
          model: null,
          engineCode: 'B5254T',
        }).expect(200),
      ),
    );

    expect(updated.rule.model).toBeNull();
    expect(updated.rule.engineCode).toBe('B5254T');
    // Untouched fields survive the partial update.
    expect(updated.rule.make).toBe(created.rule.make);
  });

  it('refuses clearing both intervals at once', async () => {
    const created = serviceRuleResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules', rule()).expect(201),
      ),
    );

    await patch(harness, admin, `/api/service-rules/${created.rule.id}`, {
      intervalKm: null,
      intervalMonths: null,
    }).expect(400);
  });

  it('deactivates a rule without deleting it', async () => {
    const created = serviceRuleResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules', rule()).expect(201),
      ),
    );

    const updated = serviceRuleResponseSchema.parse(
      jsonBody(
        await patch(harness, admin, `/api/service-rules/${created.rule.id}`, {
          isActive: false,
        }).expect(200),
      ),
    );

    expect(updated.rule.isActive).toBe(false);
    await get(harness, admin, `/api/service-rules/${created.rule.id}`).expect(
      200,
    );
  });
});

describe('B9.7.3 — the rule-match preview', () => {
  it('counts vehicles the criteria would match', async () => {
    const registrationNumber = `PRV${String(Date.now()).slice(-3)}A`;
    await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber,
        registrationNumberDisplay: registrationNumber,
        make: 'Skoda',
        model: 'Octavia',
        modelYear: 2018,
      },
    });

    const response = serviceRulePreviewResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules/preview', {
          make: 'Skoda',
          model: 'Octavia',
        }).expect(200),
      ),
    );

    expect(response.matchCount).toBeGreaterThanOrEqual(1);
    expect(
      response.sample.some(
        (vehicle) => vehicle.registrationNumberDisplay === registrationNumber,
      ),
    ).toBe(true);
  });

  it('finds nothing for a make nobody has', async () => {
    const response = serviceRulePreviewResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules/preview', {
          make: 'Zzzznomake',
        }).expect(200),
      ),
    );
    expect(response.matchCount).toBe(0);
    expect(response.sample).toHaveLength(0);
  });
});

describe('B9.7.3/B9.7.4 — CSV bulk import', () => {
  const HEADER =
    'Märke;Modell;Motorkod;Årsmodell från;Årsmodell till;Tjänst;Intervall km;Intervall månader;Anteckning;Källa';

  it('dry-runs without writing anything', async () => {
    const csv = [
      HEADER,
      'Toyota;Corolla;;;;SERVICE_A;15000;12;;Toyota servicehäfte',
    ].join('\r\n');

    const result = serviceRuleImportResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules/import', {
          csv,
          dryRun: true,
        }).expect(200),
      ),
    );

    expect(result.dryRun).toBe(true);
    expect(result.createdCount).toBe(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]?.status).toBe('VALID');

    const list = serviceRuleListResponseSchema.parse(
      jsonBody(
        await get(harness, admin, '/api/service-rules?make=Toyota').expect(200),
      ),
    );
    expect(list.data).toHaveLength(0);
  });

  it('reports an invalid row without aborting the others', async () => {
    const csv = [
      HEADER,
      'Mazda;;;;;SERVICE_A;;;;Anteckning utan intervall',
      'Mazda;;;;;SERVICE_B;20000;;;Giltig rad',
    ].join('\r\n');

    const result = serviceRuleImportResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules/import', {
          csv,
          dryRun: true,
        }).expect(200),
      ),
    );

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]?.status).toBe('INVALID');
    expect(result.rows[0]?.errors.length).toBeGreaterThan(0);
    expect(result.rows[1]?.status).toBe('VALID');
    expect(result.createdCount).toBe(0);
  });

  it('refuses to write anything when any row is invalid', async () => {
    const csv = [
      HEADER,
      'Mazda2Import;;;;;SERVICE_A;;;;Anteckning utan intervall',
    ].join('\r\n');

    await post(harness, admin, '/api/service-rules/import', {
      csv,
      dryRun: false,
    }).expect(200);

    const list = serviceRuleListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          '/api/service-rules?make=Mazda2Import',
        ).expect(200),
      ),
    );
    expect(list.data).toHaveLength(0);
  });

  it('writes every row once every row is valid', async () => {
    const csv = [
      HEADER,
      'Mazda3Import;;;;;SERVICE_A;15000;12;;Källa A',
      'Mazda3Import;;;;;TIMING_BELT;150000;120;;Källa B',
    ].join('\r\n');

    const result = serviceRuleImportResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules/import', {
          csv,
          dryRun: false,
        }).expect(200),
      ),
    );
    expect(result.createdCount).toBe(2);

    const list = serviceRuleListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          '/api/service-rules?make=Mazda3Import',
        ).expect(200),
      ),
    );
    expect(list.data).toHaveLength(2);
  });

  it('rejects a CSV with the wrong header', async () => {
    await post(harness, admin, '/api/service-rules/import', {
      csv: 'a;b;c',
      dryRun: true,
    }).expect(400);
  });
});

describe('§5.3 — authorisation', () => {
  it('refuses an unauthenticated caller', async () => {
    const supertest = (await import('supertest')).default;
    await supertest(harness.app.server).get('/api/service-rules').expect(401);
  });

  it('refuses a mechanic reading or writing rules', async () => {
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });

    await get(harness, mechanic, '/api/service-rules').expect(403);
    await post(harness, mechanic, '/api/service-rules', rule()).expect(403);
  });
});
