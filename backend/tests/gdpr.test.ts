import { createHash } from 'node:crypto';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  anonymiseCustomerResponseSchema,
  customerExportSchema,
  privacyPolicySchema,
  quoteResponseSchema,
  type QuoteResponse,
} from 'shared';
import { findDocumentWithPayload } from '../src/modules/documents/repository.js';
import { parseQuotePayload } from '../src/pdf/payload.js';
import { renderPdf } from '../src/pdf/renderer.js';
import { QuoteDocument } from '../src/pdf/templates/quote.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { anonymousAgent, loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { createStorageRoot } from './helpers/quotes.js';
import {
  get,
  labourLine,
  post,
  seedSubject,
  type SeededSubject,
} from './helpers/work-orders.js';

/**
 * GDPR export and erasure (PROJECT_SPEC.md §5.5, B11.2, B11.6).
 */

let harness: TestApp;
let storage: Awaited<ReturnType<typeof createStorageRoot>>;
let admin: Agent;

beforeAll(async () => {
  storage = await createStorageRoot();
  harness = await createTestApp({ env: { STORAGE_PATH: storage.path } });
  admin = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
  await storage.remove();
});

/** A sent quote against a fresh customer/vehicle, through the real API. */
async function sentQuoteFor(
  subject: SeededSubject,
): Promise<{ quote: QuoteResponse['quote']; documentId: string }> {
  const created = jsonBody(
    await post(harness, admin, '/api/work-orders', {
      vehicleId: subject.vehicleId,
      customerId: subject.customerId,
      description: 'Bromsservice',
    }).expect(201),
  );
  const workOrderId = String(
    (created as { workOrder: { id: string } }).workOrder.id,
  );

  await post(harness, admin, `/api/work-orders/${workOrderId}/lines`, {
    ...labourLine(),
  }).expect(201);

  const draft = quoteResponseSchema.parse(
    jsonBody(
      await post(
        harness,
        admin,
        `/api/work-orders/${workOrderId}/quotes`,
        {},
      ).expect(201),
    ),
  );

  const sent = quoteResponseSchema.parse(
    jsonBody(
      await post(harness, admin, `/api/quotes/${draft.quote.id}/send`).expect(
        200,
      ),
    ),
  );

  return { quote: sent.quote, documentId: sent.quote.documentId ?? '' };
}

describe('GET /api/customers/:id/export', () => {
  it('is closed to anyone but an ADMIN', async () => {
    const subject = await seedSubject(harness);
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });

    await supertest(harness.app.server)
      .get(`/api/customers/${subject.customerId}/export`)
      .expect(401);
    await get(
      harness,
      mechanic,
      `/api/customers/${subject.customerId}/export`,
    ).expect(403);
  });

  it('answers 404 for an unknown customer', async () => {
    await get(
      harness,
      admin,
      '/api/customers/00000000-0000-7000-8000-000000000000/export',
    ).expect(404);
  });

  it('gathers the customer together with everything that hangs off them', async () => {
    const subject = await seedSubject(harness);
    const { quote } = await sentQuoteFor(subject);

    const body = customerExportSchema.parse(
      jsonBody(
        await get(
          harness,
          admin,
          `/api/customers/${subject.customerId}/export`,
        ).expect(200),
      ),
    );

    expect(body.customer.id).toBe(subject.customerId);
    expect(body.vehicles.map((vehicle) => vehicle.id)).toContain(
      subject.vehicleId,
    );
    expect(body.workOrders.length).toBeGreaterThan(0);
    expect(body.quotes.some((q) => q.id === quote.id)).toBe(true);
    expect(new Date(body.exportedAt).toString()).not.toBe('Invalid Date');
  });
});

describe('POST /api/customers/:id/anonymise', () => {
  it('is closed to anyone but an ADMIN', async () => {
    const subject = await seedSubject(harness);
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    // A bare POST with no CSRF token fails the CSRF check before the auth
    // guard ever runs (§5.2's binding applies to anonymous callers too), so
    // "unauthenticated" here means a caller who *has* a valid double-submit
    // pair but no session — the same distinction every other module's own
    // "refuses an unauthenticated caller" test draws for a `POST` route.
    const anonymous = await anonymousAgent(harness);

    await post(
      harness,
      anonymous,
      `/api/customers/${subject.customerId}/anonymise`,
    ).expect(401);
    await post(
      harness,
      mechanic,
      `/api/customers/${subject.customerId}/anonymise`,
    ).expect(403);
  });

  it('nulls contact fields and sets anonymisedAt (§5.5)', async () => {
    const subject = await seedSubject(harness);

    const before = await harness.app.prisma.customer.findUniqueOrThrow({
      where: { id: subject.customerId },
      select: { name: true, phone: true },
    });
    expect(before.name).not.toBe('Raderad kund');

    const response = anonymiseCustomerResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          `/api/customers/${subject.customerId}/anonymise`,
        ).expect(200),
      ),
    );

    expect(response.name).toBe('Raderad kund');
    expect(response.email).toBeNull();
    expect(response.phone).toBe('000-000 00 00');
    expect(response.phoneNormalised).toBe('');
    expect(response.address).toBeNull();
    expect(response.notes).toBeNull();
    expect(response.anonymisedAt).not.toBeNull();

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { action: 'customer.anonymised', entityId: subject.customerId },
    });
    expect(entry).not.toBeNull();
    expect(entry?.userId).toBe(admin.userId);
  });

  it('is idempotent — a second call changes nothing further', async () => {
    const subject = await seedSubject(harness);

    await post(
      harness,
      admin,
      `/api/customers/${subject.customerId}/anonymise`,
    ).expect(200);
    const first = await harness.app.prisma.customer.findUniqueOrThrow({
      where: { id: subject.customerId },
      select: { anonymisedAt: true },
    });

    const secondResponse = anonymiseCustomerResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          admin,
          `/api/customers/${subject.customerId}/anonymise`,
        ).expect(200),
      ),
    );
    const second = await harness.app.prisma.customer.findUniqueOrThrow({
      where: { id: subject.customerId },
      select: { anonymisedAt: true },
    });

    expect(second.anonymisedAt?.toISOString()).toBe(
      first.anonymisedAt?.toISOString(),
    );
    expect(secondResponse.name).toBe('Raderad kund');

    const entries = await harness.app.prisma.auditLog.findMany({
      where: { action: 'customer.anonymised', entityId: subject.customerId },
    });
    expect(entries).toHaveLength(1);
  });

  it(
    'B11.2.3 — a historical quote PDF still regenerates after the customer ' +
      'is anonymised',
    async () => {
      const subject = await seedSubject(harness);
      const { documentId } = await sentQuoteFor(subject);

      await post(
        harness,
        admin,
        `/api/customers/${subject.customerId}/anonymise`,
      ).expect(200);

      const document = await findDocumentWithPayload(
        harness.app.prisma,
        documentId,
      );
      if (document === null) {
        throw new Error('the sent quote has no document');
      }

      // The payload snapshot survives the anonymisation untouched (§5.5) —
      // this is what the payload is *for*.
      const payload = parseQuotePayload(document.payloadJson);
      expect(payload.customer.name).not.toBe('Raderad kund');

      const regenerated = await renderPdf(QuoteDocument(payload));
      expect(createHash('sha256').update(regenerated).digest('hex')).toBe(
        document.fileHashSha256,
      );
    },
    60_000,
  );
});

describe('GET /api/public/privacy-policy', () => {
  it('is public and returns Swedish content (§5.5, §6.1, B11.2.4)', async () => {
    const response = privacyPolicySchema.parse(
      jsonBody(
        await supertest(harness.app.server)
          .get('/api/public/privacy-policy')
          .expect(200),
      ),
    );

    expect(response.sections.length).toBeGreaterThan(0);
    expect(response.sections[0]?.heading.length).toBeGreaterThan(0);
  });
});
