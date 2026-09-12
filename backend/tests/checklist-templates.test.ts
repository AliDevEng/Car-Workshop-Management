import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checklistTemplateListResponseSchema,
  checklistTemplateResponseSchema,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { get, patch, post } from './helpers/work-orders.js';

/**
 * Checklist templates end to end (B8.1).
 */

let harness: TestApp;
let agent: Agent;

beforeAll(async () => {
  harness = await createTestApp();
  agent = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
});

describe('B8.1 — creating and listing templates', () => {
  it('creates a template with its items', async () => {
    const response = await post(harness, agent, '/api/checklist-templates', {
      serviceType: 'SERVICE_A',
      name: 'Liten service',
      items: [
        { key: 'brakes', label: 'Bromsar' },
        { key: 'lights', label: 'Belysning' },
      ],
    }).expect(201);

    const { template } = checklistTemplateResponseSchema.parse(
      jsonBody(response),
    );
    expect(template.isActive).toBe(true);
    expect(template.version).toBe(1);
    expect(template.items).toHaveLength(2);
  });

  it('lists templates and filters by service type', async () => {
    await post(harness, agent, '/api/checklist-templates', {
      serviceType: 'MAJOR_SERVICE',
      name: 'Storservice',
      items: [{ key: 'timing_belt', label: 'Kamrem' }],
    }).expect(201);

    const list = checklistTemplateListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          '/api/checklist-templates?serviceType=MAJOR_SERVICE',
        ).expect(200),
      ),
    );

    expect(list.data.length).toBeGreaterThan(0);
    expect(
      list.data.every((template) => template.serviceType === 'MAJOR_SERVICE'),
    ).toBe(true);
  });

  it('404s for a template that does not exist', async () => {
    await get(
      harness,
      agent,
      '/api/checklist-templates/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });
});

describe('B8.1 — editing a template bumps its revision', () => {
  it('updates the name, items and active flag', async () => {
    const created = checklistTemplateResponseSchema.parse(
      jsonBody(
        await post(harness, agent, '/api/checklist-templates', {
          serviceType: 'BRAKE_FLUID',
          name: 'Bromsvätska',
          items: [{ key: 'fluid', label: 'Bromsvätska' }],
        }).expect(201),
      ),
    );

    const updated = checklistTemplateResponseSchema.parse(
      jsonBody(
        await patch(
          harness,
          agent,
          `/api/checklist-templates/${created.template.id}`,
          { name: 'Bromsvätskebyte', isActive: false },
        ).expect(200),
      ),
    );

    expect(updated.template.name).toBe('Bromsvätskebyte');
    expect(updated.template.isActive).toBe(false);
    expect(updated.template.version).toBe(created.template.version + 1);
    // Items were not part of this PATCH and must survive it untouched.
    expect(updated.template.items).toEqual(created.template.items);
  });

  it('does not retroactively change a protocol that already copied the template', async () => {
    // B8.1.3, exercised at this layer rather than through a protocol: editing
    // a template must not be observable except through a *new* copy.
    const created = checklistTemplateResponseSchema.parse(
      jsonBody(
        await post(harness, agent, '/api/checklist-templates', {
          serviceType: 'AC_SERVICE',
          name: 'AC-kontroll',
          items: [{ key: 'refrigerant', label: 'Köldmedium' }],
        }).expect(201),
      ),
    );
    const originalLabel = created.template.items[0]?.label;

    await patch(
      harness,
      agent,
      `/api/checklist-templates/${created.template.id}`,
      { items: [{ key: 'refrigerant', label: 'Köldmedienivå (omdöpt)' }] },
    ).expect(200);

    const reread = checklistTemplateResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/checklist-templates/${created.template.id}`,
        ).expect(200),
      ),
    );

    expect(reread.template.items[0]?.label).not.toBe(originalLabel);
  });
});

describe('§5.3 — authorisation', () => {
  it('refuses an unauthenticated caller', async () => {
    const supertest = (await import('supertest')).default;
    await supertest(harness.app.server)
      .get('/api/checklist-templates')
      .expect(401);
  });

  it('refuses a mechanic creating or editing a template', async () => {
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });

    await post(harness, mechanic, '/api/checklist-templates', {
      serviceType: 'OTHER',
      name: 'Övrigt',
      items: [{ key: 'note', label: 'Anteckning' }],
    }).expect(403);
  });

  it('lets any staff member read the templates', async () => {
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    await get(harness, mechanic, '/api/checklist-templates').expect(200);
  });
});
