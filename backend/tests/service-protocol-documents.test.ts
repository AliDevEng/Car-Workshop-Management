import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PDF_CONTENT_TYPE,
  checklistTemplateResponseSchema,
  documentReadSchema,
  serviceProtocolResponseSchema,
  type ChecklistTemplate,
  type ServiceProtocolResponse,
} from 'shared';
import { findDocumentWithPayload } from '../src/modules/documents/repository.js';
import { parseServiceProtocolPayload } from '../src/pdf/payload.js';
import { renderPdf } from '../src/pdf/renderer.js';
import { ServiceProtocolDocument } from '../src/pdf/templates/service-protocol.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { extractPdfTextNormalised } from './helpers/pdf-text.js';
import { createStorageRoot } from './helpers/quotes.js';
import {
  completeWorkOrder,
  get,
  labourLine,
  partLine,
  post,
  seedArticle,
  seedSubject,
} from './helpers/work-orders.js';

/**
 * Document delivery, end to end (B8.3, B8.4, mirroring `quote-documents.test.ts`).
 *
 * B8.6.3 asks for a Swedish-glyph, mileage, audit and immutability journey for
 * a complete protocol — this file is the download half of that; `mileage` and
 * `audit` are covered in `service-protocols.test.ts`.
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
    items: [{ key: 'brakes', label: 'Bromsar' }],
  }).expect(201);
  return checklistTemplateResponseSchema.parse(jsonBody(response)).template;
}

/** A finalised protocol, with its document, through the real API only. */
async function finalisedProtocol(): Promise<ServiceProtocolResponse> {
  const template = await seedChecklistTemplate();
  const subject = await seedSubject(harness);
  const articleId = await seedArticle(harness, agent.userId);

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
  await post(harness, agent, `/api/work-orders/${workOrderId}/lines`, {
    ...partLine(articleId, { quantity: '2' }),
  }).expect(201);
  await completeWorkOrder(harness, agent, workOrderId, 55_000);

  const draft = serviceProtocolResponseSchema.parse(
    jsonBody(
      await post(
        harness,
        agent,
        `/api/work-orders/${workOrderId}/service-protocols`,
        {
          checklistTemplateId: template.id,
          odometerKm: 55_000,
          checklist: [{ key: 'brakes', label: 'Bromsar', result: 'OK' }],
        },
      ).expect(201),
    ),
  );

  return serviceProtocolResponseSchema.parse(
    jsonBody(
      await post(
        harness,
        agent,
        `/api/service-protocols/${draft.protocol.id}/finalise`,
      ).expect(200),
    ),
  );
}

describe('B8.6.1 — generate, store and download', () => {
  it('serves the stored PDF with the right headers', async () => {
    const { protocol } = await finalisedProtocol();

    const response = await withAgent(
      supertest(harness.app.server)
        .get(`/api/documents/${protocol.documentId ?? ''}/file`)
        .buffer(true)
        .parse((res, callback) => {
          const chunks: Buffer[] = [];
          res.on('data', (chunk: Buffer) => chunks.push(chunk));
          res.on('end', () => {
            callback(null, Buffer.concat(chunks));
          });
        }),
      agent,
    ).expect(200);

    expect(response.headers['content-type']).toContain(PDF_CONTENT_TYPE);
    expect(response.headers['content-disposition']).toBe(
      `attachment; filename="${protocol.number ?? ''}.pdf"`,
    );
    expect(response.headers['cache-control']).toBe('private, no-store');

    const bytes: unknown = response.body;
    if (!Buffer.isBuffer(bytes)) {
      throw new Error('the download did not arrive as a Buffer');
    }
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('prints the odometer in mil and the checklist result', async () => {
    const { protocol } = await finalisedProtocol();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: protocol.documentId ?? '' },
      select: { filePath: true },
    });

    const bytes = await readFile(path.join(storage.path, document.filePath));
    const text = extractPdfTextNormalised(bytes);

    // 55 000 km → 5 500,0 mil (§3.5).
    expect(text).toContain('5 500,0 mil');
    expect(text).toContain('Bromsar');
    expect(text).toContain('Utan anmärkning');
    expect(text).toContain(protocol.number ?? 'MISSING');
  });

  it('returns the document metadata without its file path', async () => {
    const { protocol } = await finalisedProtocol();

    const body = jsonBody(
      await get(
        harness,
        agent,
        `/api/documents/${protocol.documentId ?? ''}`,
      ).expect(200),
    );
    const document = documentReadSchema.parse(body);

    expect(document.type).toBe('SERVICE_PROTOCOL');
    expect(document.number).toBe(protocol.number);
    expect(document.fileHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(body).not.toHaveProperty('filePath');
  });
});

describe('B8.4.4 — regeneration from payloadJson', () => {
  it('rebuilds the identical file from the stored payload', async () => {
    const { protocol } = await finalisedProtocol();
    const document = await findDocumentWithPayload(
      harness.app.prisma,
      protocol.documentId ?? '',
    );
    if (document === null) {
      throw new Error('the finalised protocol has no document');
    }

    const payload = parseServiceProtocolPayload(document.payloadJson);
    const regenerated = await renderPdf(ServiceProtocolDocument(payload));

    expect(createHash('sha256').update(regenerated).digest('hex')).toBe(
      document.fileHashSha256,
    );

    const stored = await readFile(path.join(storage.path, document.filePath));
    expect(regenerated.equals(stored)).toBe(true);
  }, 60_000);

  it('carries the customer as they were, not as they are (§5.5)', async () => {
    const { protocol } = await finalisedProtocol();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: protocol.documentId ?? '' },
      select: { payloadJson: true },
    });
    const before = parseServiceProtocolPayload(document.payloadJson).customer
      .name;

    await harness.app.prisma.customer.update({
      where: { id: protocol.customer.id },
      data: { name: 'Anonymiserad kund' },
    });

    const after = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: protocol.documentId ?? '' },
      select: { payloadJson: true },
    });
    expect(parseServiceProtocolPayload(after.payloadJson).customer.name).toBe(
      before,
    );
    expect(before).not.toBe('Anonymiserad kund');
  });
});

describe('B8.6.2 — the defined errors', () => {
  it('404s for a document that does not exist', async () => {
    await get(
      harness,
      agent,
      '/api/documents/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });

  it('401s an unauthenticated download', async () => {
    const { protocol } = await finalisedProtocol();

    await supertest(harness.app.server)
      .get(`/api/documents/${protocol.documentId ?? ''}/file`)
      .expect(401);
  });
});
