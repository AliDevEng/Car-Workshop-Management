import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { publicWorkshopInfoSchema, settingsResponseSchema } from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { jsonBody } from './helpers/http.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { SETTING_KEYS } from '../src/config/settings.js';

/**
 * B3.5 — workshop settings, read only (PROJECT_SPEC.md §4.2).
 *
 * `GET /api/public/workshop` exposes only the deliberately public fields;
 * `GET /api/settings` returns the full view behind a login. Writes are B9.7.
 */

describe('settings reads', () => {
  let harness: TestApp;
  let agent: Agent;

  beforeAll(async () => {
    harness = await createTestApp();
    agent = await loginAs(harness);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('serves the built-in defaults when nothing is stored', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/public/workshop')
      .expect(200);

    const info = publicWorkshopInfoSchema.parse(jsonBody(response));
    expect(info.openingHours).toHaveLength(7);
    expect(info.workshop.name).toBeTypeOf('string');
  });

  it('does not expose operational settings on the public route', async () => {
    const response = await supertest(harness.app.server)
      .get('/api/public/workshop')
      .expect(200);
    expect(response.text).not.toContain('vehicleLookupDailyLimit');
    expect(response.text).not.toContain('defaultHourlyRateOre');
  });

  it('reads a stored workshop group back through the typed accessor', async () => {
    await harness.app.prisma.setting.create({
      data: {
        key: SETTING_KEYS.workshop,
        valueJson: {
          name: 'Test Verkstad AB',
          orgNumber: '556999-0001',
          address: 'Testgatan 1',
          postalCode: '111 11',
          city: 'Teststad',
          phone: '08-000 11 22',
          email: 'test@verkstad.se',
        },
      },
    });

    const response = await supertest(harness.app.server)
      .get('/api/public/workshop')
      .expect(200);
    expect(
      publicWorkshopInfoSchema.parse(jsonBody(response)).workshop.name,
    ).toBe('Test Verkstad AB');
  });

  it('reads stored opening hours and operational settings back', async () => {
    await harness.app.prisma.setting.createMany({
      data: [
        {
          key: SETTING_KEYS.openingHours,
          valueJson: [
            { weekday: 'MONDAY', opensAt: '06:30', closesAt: '15:30' },
            { weekday: 'TUESDAY', opensAt: '06:30', closesAt: '15:30' },
            { weekday: 'WEDNESDAY', opensAt: '06:30', closesAt: '15:30' },
            { weekday: 'THURSDAY', opensAt: '06:30', closesAt: '15:30' },
            { weekday: 'FRIDAY', opensAt: '06:30', closesAt: '15:30' },
            { weekday: 'SATURDAY', opensAt: null, closesAt: null },
            { weekday: 'SUNDAY', opensAt: null, closesAt: null },
          ],
        },
        {
          key: SETTING_KEYS.operational,
          valueJson: {
            defaultHourlyRateOre: 72_500,
            quoteValidityDays: 21,
            vehicleLookupDailyLimitStaff: 150,
            vehicleLookupDailyLimitPublic: 40,
          },
        },
      ],
    });

    const response = await supertest(harness.app.server)
      .get('/api/settings')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);

    const settings = settingsResponseSchema.parse(jsonBody(response));
    expect(settings.openingHours[0]?.opensAt).toBe('06:30');
    expect(settings.operational.defaultHourlyRateOre).toBe(72_500);
    expect(settings.operational.quoteValidityDays).toBe(21);
  });

  it('requires a login for the full settings view', async () => {
    await supertest(harness.app.server).get('/api/settings').expect(401);

    const response = await supertest(harness.app.server)
      .get('/api/settings')
      .set('cookie', agent.cookies.join('; '))
      .expect(200);

    const settings = settingsResponseSchema.parse(jsonBody(response));
    expect(settings.operational.quoteValidityDays).toBeGreaterThan(0);
    expect(settings.operational.vehicleLookupDailyLimitPublic).toBeGreaterThan(
      0,
    );
  });

  it('surfaces a corrupted setting rather than hiding it', async () => {
    await harness.app.prisma.setting.upsert({
      where: { key: SETTING_KEYS.operational },
      update: { valueJson: { nonsense: true } },
      create: { key: SETTING_KEYS.operational, valueJson: { nonsense: true } },
    });

    await supertest(harness.app.server)
      .get('/api/settings')
      .set('cookie', agent.cookies.join('; '))
      .expect(500);
  });
});
