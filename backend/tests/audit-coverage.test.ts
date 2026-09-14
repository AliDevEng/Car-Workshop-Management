import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checklistTemplateResponseSchema,
  partnerLinkListResponseSchema,
  partnerLinkResponseSchema,
  serviceRecommendationResponseSchema,
  serviceRuleResponseSchema,
  settingsResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { patch, post, seedSubject } from './helpers/work-orders.js';

/**
 * B11.1.5 — "enumerate the required mutations and assert each writes a row."
 *
 * §4.2 requires an audit entry for every mutation of money, stock, status,
 * service rules and personal data. Most of the ~40 distinct actions the
 * backend writes already have their own assertion at the point they were
 * built — `tests/audit.test.ts` for users, and `customers.test.ts`,
 * `articles.test.ts`, `stock-movements.test.ts`, `bookings.test.ts`,
 * `booking-requests.test.ts`, `vehicles.test.ts`, `quotes.test.ts`,
 * `service-protocols.test.ts`, `work-order-completion.test.ts` and
 * `work-order-journey.test.ts` each check their own. `gdpr.test.ts` checks
 * `customer.anonymised`, and `jobs.test.ts` checks the two actions the
 * scheduled jobs write.
 *
 * What was missing when this iteration started — confirmed by grepping every
 * test file for `auditLog.find` before writing this one — is the six actions
 * below: `checklist-templates.test.ts`, `service-rules.test.ts`,
 * `service-recommendations.test.ts`, `partner-links.test.ts`,
 * `settings.test.ts` and `vehicle-data.test.ts` all exercised their routes
 * without ever reading the log back. This file closes exactly that gap,
 * rather than re-testing the ~30 actions already covered elsewhere.
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

async function auditRow(action: string, entityId: string) {
  return harness.app.prisma.auditLog.findFirst({
    where: { action, entityId },
  });
}

describe('checklist templates', () => {
  it('records checklist_template.created and .updated', async () => {
    const created = checklistTemplateResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/checklist-templates', {
          serviceType: 'SERVICE_A',
          name: 'Granskad mall',
          items: [{ key: 'brakes', label: 'Bromsar' }],
        }).expect(201),
      ),
    );
    expect(await auditRow('checklist_template.created', created.template.id)).not.toBeNull();

    await patch(
      harness,
      admin,
      `/api/checklist-templates/${created.template.id}`,
      { name: 'Uppdaterad mall' },
    ).expect(200);
    expect(await auditRow('checklist_template.updated', created.template.id)).not.toBeNull();
  });
});

describe('service rules', () => {
  it('records service_rule.created, .updated and .imported', async () => {
    const created = serviceRuleResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/service-rules', {
          make: `Granskningsbil-${crypto.randomUUID().slice(0, 8)}`,
          serviceType: 'SERVICE_A',
          intervalKm: 15_000,
          sourceNote: 'Testad servicebok',
        }).expect(201),
      ),
    );
    expect(await auditRow('service_rule.created', created.rule.id)).not.toBeNull();

    await patch(harness, admin, `/api/service-rules/${created.rule.id}`, {
      intervalKm: 20_000,
    }).expect(200);
    expect(await auditRow('service_rule.updated', created.rule.id)).not.toBeNull();

    const header =
      'Märke;Modell;Motorkod;Årsmodell från;Årsmodell till;Tjänst;Intervall km;Intervall månader;Anteckning;Källa';
    const csv = [
      header,
      `Importbil-${crypto.randomUUID().slice(0, 8)};;;;;SERVICE_A;15000;12;;Importerad källa`,
    ].join('\r\n');
    await post(harness, admin, '/api/service-rules/import', {
      csv,
      dryRun: false,
    }).expect(200);
    const imported = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'service_rule.imported' },
      orderBy: { at: 'desc' },
    });
    expect(imported).not.toBeNull();
  });
});

describe('service recommendations', () => {
  it('records service_recommendation.accepted and .dismissed', async () => {
    const subject = await seedSubject(harness);
    const make = `Rekommendationsbil-${crypto.randomUUID().slice(0, 8)}`;
    await harness.app.prisma.vehicle.update({
      where: { id: subject.vehicleId },
      data: {
        make,
        firstRegistrationDate: new Date('2015-01-01T00:00:00.000Z'),
      },
    });

    await post(harness, admin, '/api/service-rules', {
      make,
      serviceType: 'SERVICE_A',
      intervalKm: 1_000,
      sourceNote: 'Testad servicebok',
    }).expect(201);
    await post(harness, admin, '/api/service-rules', {
      make,
      serviceType: 'BRAKE_FLUID',
      intervalKm: 1_000,
      sourceNote: 'Testad servicebok',
    }).expect(201);

    await post(
      harness,
      admin,
      `/api/vehicles/${subject.vehicleId}/odometer-readings`,
      { km: 5_000 },
    ).expect(201);

    const recommendations = await harness.app.prisma.serviceRecommendation.findMany(
      { where: { vehicleId: subject.vehicleId } },
    );
    expect(recommendations.length).toBeGreaterThanOrEqual(2);
    const [first, second] = recommendations;
    if (first === undefined || second === undefined) {
      throw new Error('expected at least two recommendations');
    }

    serviceRecommendationResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          `/api/service-recommendations/${first.id}/accept`,
        ).expect(200),
      ),
    );
    expect(await auditRow('service_recommendation.accepted', first.id)).not.toBeNull();

    serviceRecommendationResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          `/api/service-recommendations/${second.id}/dismiss`,
        ).expect(200),
      ),
    );
    expect(await auditRow('service_recommendation.dismissed', second.id)).not.toBeNull();
  });
});

describe('partner links', () => {
  it('records partner_link.created, .updated and .reordered', async () => {
    const first = partnerLinkResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links', {
          name: `Granskad länk ${crypto.randomUUID().slice(0, 8)}`,
          urlTemplate: 'https://example.se/sok?regnr={regnr}',
          placeholderType: 'REGNR',
        }).expect(201),
      ),
    );
    expect(await auditRow('partner_link.created', first.link.id)).not.toBeNull();

    await patch(harness, admin, `/api/partner-links/${first.link.id}`, {
      name: 'Omdöpt länk',
    }).expect(200);
    expect(await auditRow('partner_link.updated', first.link.id)).not.toBeNull();

    const second = partnerLinkResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links', {
          name: `Andra länken ${crypto.randomUUID().slice(0, 8)}`,
          urlTemplate: 'https://example.se/artikel/{artnr}',
          placeholderType: 'ARTICLE_NUMBER',
        }).expect(201),
      ),
    );

    const reordered = partnerLinkListResponseSchema.parse(
      jsonBody(
        await post(harness, admin, '/api/partner-links/reorder', {
          orderedIds: [second.link.id, first.link.id],
        }).expect(200),
      ),
    );
    expect(reordered.data.length).toBeGreaterThanOrEqual(2);
    const reorderEntry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'partner_link.reordered' },
      orderBy: { at: 'desc' },
    });
    expect(reorderEntry).not.toBeNull();
  });
});

describe('settings', () => {
  it('records settings.updated', async () => {
    await patch(harness, admin, '/api/settings', {
      operational: {
        defaultHourlyRateOre: 73_000,
        quoteValidityDays: 30,
        vehicleLookupDailyLimitStaff: 200,
        vehicleLookupDailyLimitPublic: 100,
      },
    }).expect(200);

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'settings.updated' },
      orderBy: { at: 'desc' },
    });
    expect(entry).not.toBeNull();
    settingsResponseSchema.parse(entry?.afterJson);
  });
});

describe('vehicle data', () => {
  it('records vehicle_data.fetched on a staff refresh', async () => {
    // A fixture registration number the mock provider (§7.1, B10.1) answers
    // for — the same one `vehicle-data.test.ts` uses for its own refresh
    // coverage.
    const registrationNumber = 'DEF456';
    const vehicle = await harness.app.prisma.vehicle.create({
      data: {
        registrationNumber,
        registrationNumberDisplay: registrationNumber,
        make: 'Okänt fabrikat',
        model: 'Okänd modell',
      },
      select: { id: true },
    });

    await post(
      harness,
      admin,
      `/api/vehicles/${vehicle.id}/vehicle-data/refresh`,
    ).expect(200);

    expect(await auditRow('vehicle_data.fetched', vehicle.id)).not.toBeNull();
  });
});
