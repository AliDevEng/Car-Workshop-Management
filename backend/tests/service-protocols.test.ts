import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  checklistTemplateResponseSchema,
  serviceProtocolListResponseSchema,
  serviceProtocolResponseSchema,
  type ChecklistTemplate,
  type ServiceProtocolResponse,
} from 'shared';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { createStorageRoot } from './helpers/quotes.js';
import {
  completeWorkOrder,
  get,
  labourLine,
  patch,
  post,
  seedSubject,
} from './helpers/work-orders.js';

/**
 * Service protocols end to end (B8.1, B8.2, B8.4, B8.5).
 *
 * Everything goes through the real API. Customers, vehicles and work orders
 * are seeded through their own paths — B3 and B6 already cover those — so a
 * protocol test failing tells nobody anything about customers or work orders.
 */

let harness: TestApp;
let storage: Awaited<ReturnType<typeof createStorageRoot>>;
let agent: Agent;

beforeAll(async () => {
  storage = await createStorageRoot();
  harness = await createTestApp({ env: { STORAGE_PATH: storage.path } });
  agent = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
  await storage.remove();
});

async function seedChecklistTemplate(): Promise<ChecklistTemplate> {
  const response = await post(harness, agent, '/api/checklist-templates', {
    serviceType: 'SERVICE_A',
    name: 'Standardkontroll',
    items: [
      { key: 'brakes', label: 'Bromsar' },
      { key: 'tyres', label: 'Däck' },
    ],
  }).expect(201);
  return checklistTemplateResponseSchema.parse(jsonBody(response)).template;
}

function answersFor(
  template: ChecklistTemplate,
  overrides: Record<string, { result: string; note?: string }> = {},
): { key: string; label: string; result: string; note?: string | undefined }[] {
  return template.items.map((item) => ({
    key: item.key,
    label: item.label,
    result: overrides[item.key]?.result ?? 'OK',
    ...(overrides[item.key]?.note === undefined
      ? {}
      : { note: overrides[item.key]?.note }),
  }));
}

/** A vehicle with a `COMPLETED` work order, ready for a protocol. */
async function seedCompletedWorkOrder(): Promise<string> {
  const subject = await seedSubject(harness);
  const created = jsonBody(
    await post(harness, agent, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Årlig service och bromsvätskebyte',
    }).expect(201),
  );
  const workOrderId = String(
    (created as { workOrder: { id: string } }).workOrder.id,
  );

  await post(harness, agent, `/api/work-orders/${workOrderId}/lines`, {
    ...labourLine(),
  }).expect(201);
  await completeWorkOrder(harness, agent, workOrderId);

  return workOrderId;
}

async function createProtocol(
  workOrderId: string,
  template: ChecklistTemplate,
  overrides: Record<string, unknown> = {},
): Promise<ServiceProtocolResponse> {
  const response = await post(
    harness,
    agent,
    `/api/work-orders/${workOrderId}/service-protocols`,
    {
      checklistTemplateId: template.id,
      odometerKm: 12_345,
      checklist: answersFor(template),
      ...overrides,
    },
  ).expect(201);
  return serviceProtocolResponseSchema.parse(jsonBody(response));
}

async function finaliseProtocol(id: string): Promise<ServiceProtocolResponse> {
  const response = await post(
    harness,
    agent,
    `/api/service-protocols/${id}/finalise`,
  ).expect(200);
  return serviceProtocolResponseSchema.parse(jsonBody(response));
}

describe('B8.2 — creating a protocol', () => {
  it('copies the checklist template with its answers', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();

    const { protocol } = await createProtocol(workOrderId, template);

    expect(protocol.revision).toBe(1);
    expect(protocol.number).toBeNull();
    expect(protocol.finalisedAt).toBeNull();
    expect(protocol.checklist).toHaveLength(2);
    expect(protocol.checklist.map((answer) => answer.key).sort()).toEqual([
      'brakes',
      'tyres',
    ]);
  });

  it('refuses a work order that is not COMPLETED', async () => {
    const template = await seedChecklistTemplate();
    const subject = await seedSubject(harness);
    const created = jsonBody(
      await post(harness, agent, '/api/work-orders', {
        vehicleId: subject.vehicleId,
        customerId: subject.customerId,
        description: 'Pågående jobb',
      }).expect(201),
    );
    const workOrderId = String(
      (created as { workOrder: { id: string } }).workOrder.id,
    );

    await post(
      harness,
      agent,
      `/api/work-orders/${workOrderId}/service-protocols`,
      {
        checklistTemplateId: template.id,
        odometerKm: 1000,
        checklist: answersFor(template),
      },
    ).expect(409);
  });

  it('404s for a checklist template that does not exist', async () => {
    const workOrderId = await seedCompletedWorkOrder();

    await post(
      harness,
      agent,
      `/api/work-orders/${workOrderId}/service-protocols`,
      {
        checklistTemplateId: '00000000-0000-0000-0000-000000000000',
        odometerKm: 1000,
        checklist: [],
      },
    ).expect(404);
  });

  it('refuses a checklist that does not match the template', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();

    await post(
      harness,
      agent,
      `/api/work-orders/${workOrderId}/service-protocols`,
      {
        checklistTemplateId: template.id,
        odometerKm: 1000,
        // Missing "tyres", and an item the template does not have.
        checklist: [
          { key: 'brakes', label: 'Bromsar', result: 'OK' },
          { key: 'lights', label: 'Belysning', result: 'OK' },
        ],
      },
    ).expect(409);
  });

  it('creates a second, independent protocol on the same order', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();

    const first = await createProtocol(workOrderId, template);
    const second = await createProtocol(workOrderId, template);

    expect(first.protocol.revision).toBe(1);
    expect(second.protocol.revision).toBe(2);
    expect(second.protocol.supersedesProtocolId).toBeNull();
  });

  it('404s for a work order that does not exist', async () => {
    const template = await seedChecklistTemplate();
    await post(
      harness,
      agent,
      '/api/work-orders/00000000-0000-0000-0000-000000000000/service-protocols',
      {
        checklistTemplateId: template.id,
        odometerKm: 1000,
        checklist: answersFor(template),
      },
    ).expect(404);
  });
});

describe('B8.5.1 — editing before finalisation', () => {
  it('allows a PATCH while unfinalised', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);

    const updated = serviceProtocolResponseSchema.parse(
      jsonBody(
        await patch(harness, agent, `/api/service-protocols/${protocol.id}`, {
          notes: 'Uppdaterad anteckning',
          nextServiceDueKm: 20_000,
        }).expect(200),
      ),
    );

    expect(updated.protocol.notes).toBe('Uppdaterad anteckning');
    expect(updated.protocol.nextServiceDueKm).toBe(20_000);
  });

  it('B8.5.1 — a PATCH on a finalised protocol returns 409', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);
    await finaliseProtocol(protocol.id);

    await patch(harness, agent, `/api/service-protocols/${protocol.id}`, {
      notes: 'För sent',
    }).expect(409);
  });
});

describe('B8.4 — finalising', () => {
  it('assigns a number, writes a document and sets finalisedAt', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);

    const { protocol: finalised } = await finaliseProtocol(protocol.id);

    expect(finalised.number).toMatch(/^SP-\d{4}-\d{4}$/);
    expect(finalised.documentId).not.toBeNull();
    expect(finalised.finalisedAt).not.toBeNull();
  });

  it('draws numbers from a sequence, without gaps or repeats', async () => {
    const template = await seedChecklistTemplate();
    const numbers: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const workOrderId = await seedCompletedWorkOrder();
      const { protocol } = await createProtocol(workOrderId, template);
      const { protocol: finalised } = await finaliseProtocol(protocol.id);
      numbers.push(finalised.number ?? '');
    }

    const sequence = numbers.map((value) => Number(value.slice(-4)));
    expect(new Set(numbers).size).toBe(3);
    expect(sequence[1]).toBe((sequence[0] ?? 0) + 1);
    expect(sequence[2]).toBe((sequence[1] ?? 0) + 1);
  });

  it('refuses a second finalisation', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);
    await finaliseProtocol(protocol.id);

    await post(
      harness,
      agent,
      `/api/service-protocols/${protocol.id}/finalise`,
    ).expect(409);
  });

  it('replays a finalisation carrying the same Idempotency-Key', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);
    const key = `finalise-${crypto.randomUUID()}`;

    const first = serviceProtocolResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          agent,
          `/api/service-protocols/${protocol.id}/finalise`,
        )
          .set('idempotency-key', key)
          .expect(200),
      ),
    );
    const replay = serviceProtocolResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          agent,
          `/api/service-protocols/${protocol.id}/finalise`,
        )
          .set('idempotency-key', key)
          .expect(200),
      ),
    );

    expect(replay.protocol.number).toBe(first.protocol.number);
    expect(replay.protocol.documentId).toBe(first.protocol.documentId);

    const documents = await harness.app.prisma.document.count({
      where: { number: first.protocol.number ?? '' },
    });
    expect(documents).toBe(1);
  });
});

describe('B8.4.2 and B8.5.2 — corrections', () => {
  it('creates the next version of a finalised protocol', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol: first } = await createProtocol(workOrderId, template);
    await finaliseProtocol(first.id);

    const response = await post(
      harness,
      agent,
      `/api/service-protocols/${first.id}/correct`,
      {
        checklistTemplateId: template.id,
        odometerKm: 12_400,
        checklist: answersFor(template, {
          tyres: { result: 'ATTENTION', note: 'Rättat i efterhand' },
        }),
      },
    ).expect(201);
    const corrected = serviceProtocolResponseSchema.parse(jsonBody(response));

    expect(corrected.protocol.id).not.toBe(first.id);
    expect(corrected.protocol.revision).toBe(2);
    expect(corrected.protocol.supersedesProtocolId).toBe(first.id);
    expect(corrected.protocol.finalisedAt).toBeNull();
  });

  it('leaves the corrected protocol and its document untouched', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol: first } = await createProtocol(workOrderId, template);
    const { protocol: finalised } = await finaliseProtocol(first.id);

    await post(harness, agent, `/api/service-protocols/${first.id}/correct`, {
      checklistTemplateId: template.id,
      odometerKm: 12_400,
      checklist: answersFor(template),
    }).expect(201);

    const original = serviceProtocolResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/service-protocols/${first.id}`,
        ).expect(200),
      ),
    );

    expect(original.protocol.finalisedAt).not.toBeNull();
    expect(original.protocol.number).toBe(finalised.number);
    expect(original.protocol.documentId).toBe(finalised.documentId);
  });

  it('refuses to correct the same protocol twice', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);
    await finaliseProtocol(protocol.id);

    const correctionInput = {
      checklistTemplateId: template.id,
      odometerKm: 12_400,
      checklist: answersFor(template),
    };
    await post(
      harness,
      agent,
      `/api/service-protocols/${protocol.id}/correct`,
      correctionInput,
    ).expect(201);
    await post(
      harness,
      agent,
      `/api/service-protocols/${protocol.id}/correct`,
      correctionInput,
    ).expect(409);
  });

  it('refuses to correct a protocol that has not been finalised — it is edited directly', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);

    await post(
      harness,
      agent,
      `/api/service-protocols/${protocol.id}/correct`,
      {
        checklistTemplateId: template.id,
        odometerKm: 12_400,
        checklist: answersFor(template),
      },
    ).expect(409);
  });

  it('lists every version on the work order', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol: first } = await createProtocol(workOrderId, template);
    await finaliseProtocol(first.id);
    await post(harness, agent, `/api/service-protocols/${first.id}/correct`, {
      checklistTemplateId: template.id,
      odometerKm: 12_400,
      checklist: answersFor(template),
    }).expect(201);

    const list = serviceProtocolListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/work-orders/${workOrderId}/service-protocols`,
        ).expect(200),
      ),
    );

    expect(list.data).toHaveLength(2);
    expect(list.data.map((item) => item.revision).sort()).toEqual([1, 2]);
  });
});

describe('the protocol list', () => {
  it('filters to only finalised protocols', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);
    await finaliseProtocol(protocol.id);

    const list = serviceProtocolListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          '/api/service-protocols?finalised=true&limit=100',
        ).expect(200),
      ),
    );

    expect(list.data.some((item) => item.id === protocol.id)).toBe(true);
    expect(list.data.every((item) => item.finalisedAt !== null)).toBe(true);
  });

  it('404s for a protocol that does not exist', async () => {
    await get(
      harness,
      agent,
      '/api/service-protocols/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });
});

describe('§4.2 — the mutations are audited', () => {
  it('records creation and finalisation', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);
    await finaliseProtocol(protocol.id);

    const actions = (
      await harness.app.prisma.auditLog.findMany({
        where: { entityType: 'ServiceProtocol', entityId: protocol.id },
        select: { action: true },
        orderBy: { at: 'asc' },
      })
    ).map((entry) => entry.action);

    expect(actions).toEqual([
      'service_protocol.created',
      'service_protocol.finalised',
    ]);
  });
});

describe('§5.3 — authorisation', () => {
  it('refuses an unauthenticated caller', async () => {
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();
    const { protocol } = await createProtocol(workOrderId, template);

    const supertest = (await import('supertest')).default;
    await supertest(harness.app.server)
      .get(`/api/service-protocols/${protocol.id}`)
      .expect(401);
  });

  it('lets a mechanic write up the job they finished', async () => {
    // §5.3 reserves ADMIN for prices, users, rules, links and settings.
    // Writing up the completed job is the mechanic's own work.
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    const template = await seedChecklistTemplate();
    const workOrderId = await seedCompletedWorkOrder();

    await post(
      harness,
      mechanic,
      `/api/work-orders/${workOrderId}/service-protocols`,
      {
        checklistTemplateId: template.id,
        odometerKm: 12_345,
        checklist: answersFor(template),
      },
    ).expect(201);
  });
});
