import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import supertest from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  PDF_CONTENT_TYPE,
  documentReadSchema,
  quoteResponseSchema,
  type QuoteResponse,
} from 'shared';
import { findDocumentWithPayload } from '../src/modules/documents/repository.js';
import { parseQuotePayload } from '../src/pdf/payload.js';
import { renderPdf } from '../src/pdf/renderer.js';
import { QuoteDocument } from '../src/pdf/templates/quote.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, withAgent, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { extractPdfTextNormalised } from './helpers/pdf-text.js';
import { createStorageRoot } from './helpers/quotes.js';
import {
  get,
  labourLine,
  partLine,
  post,
  seedArticle,
  seedSubject,
} from './helpers/work-orders.js';

/**
 * Document delivery, end to end (B7.2.3, B7.4.5, B7.6).
 *
 * B7.6.1 asks for a quote to be generated, stored and downloaded through the
 * authenticated API, with the displayed totals compared against the extracted
 * PDF text. That comparison is the point of the whole iteration: it is the
 * only check that the number on the screen and the number in the customer's
 * hand came from the same arithmetic.
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

/** A sent quote, with its document, through the real API only. */
async function sentQuote(): Promise<QuoteResponse> {
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
    ...partLine(articleId, { quantity: '4.25' }),
  }).expect(201);

  const draft = quoteResponseSchema.parse(
    jsonBody(
      await post(
        harness,
        agent,
        `/api/work-orders/${workOrderId}/quotes`,
        {},
      ).expect(201),
    ),
  );

  return quoteResponseSchema.parse(
    jsonBody(
      await post(harness, agent, `/api/quotes/${draft.quote.id}/send`).expect(
        200,
      ),
    ),
  );
}

describe('B7.6.1 — generate, store and download', () => {
  it('serves the stored PDF with the right headers', async () => {
    const { quote } = await sentQuote();

    const response = await withAgent(
      supertest(harness.app.server)
        .get(`/api/documents/${quote.documentId ?? ''}/file`)
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
      `attachment; filename="${quote.number ?? ''}.pdf"`,
    );
    // A customer's personal data: a shared cache must not keep a copy.
    expect(response.headers['cache-control']).toBe('private, no-store');

    // Supertest types `.body` as `any`, so it is narrowed rather than cast —
    // the same reasoning as `jsonBody`. `Buffer.isBuffer` is a real type
    // guard, so the assertion below needs no `as`.
    const bytes: unknown = response.body;
    if (!Buffer.isBuffer(bytes)) {
      throw new Error('the download did not arrive as a Buffer');
    }
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.byteLength).toBeGreaterThan(0);
  });

  it('B7.6.1 — the displayed totals are the totals in the PDF', async () => {
    // The assertion the iteration exists for. The API's numbers and the
    // document's numbers are compared directly, so a divergence between what
    // a mechanic reads on screen and what a customer reads on paper fails
    // here rather than at a counter.
    const { quote } = await sentQuote();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { filePath: true },
    });

    const bytes = await readFile(path.join(storage.path, document.filePath));
    const text = extractPdfTextNormalised(bytes);

    const kronor = (value: number): string => {
      const absolute = Math.abs(value);
      const fraction = absolute % 100;
      const whole = (absolute - fraction) / 100;
      const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
      return `${grouped},${String(fraction).padStart(2, '0')}`;
    };

    expect(text).toContain(`Summa exkl. moms ${kronor(quote.totals.netOre)}`);
    expect(text).toContain(`Moms ${kronor(quote.totals.vatOre)}`);
    expect(text).toContain(`Summa inkl. moms ${kronor(quote.totals.grossOre)}`);
    expect(text).toContain(
      `Att betala ${kronor(quote.totals.roundedGrossOre)} kr`,
    );
    expect(text).toContain(quote.number ?? 'MISSING');
  });

  it('prints every line the quote reports', async () => {
    const { quote } = await sentQuote();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { filePath: true },
    });
    const text = extractPdfTextNormalised(
      await readFile(path.join(storage.path, document.filePath)),
    );

    for (const line of quote.lines) {
      expect(text).toContain(line.description);
    }
  });

  it('returns the document metadata without its file path', async () => {
    // §8.3: `filePath` is a server-side path. Publishing it invites a caller
    // to construct one, which is the surface B7.2.3's traversal test closes.
    const { quote } = await sentQuote();

    const body = jsonBody(
      await get(
        harness,
        agent,
        `/api/documents/${quote.documentId ?? ''}`,
      ).expect(200),
    );
    const document = documentReadSchema.parse(body);

    expect(document.type).toBe('QUOTE');
    expect(document.number).toBe(quote.number);
    expect(document.fileHashSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(document.sizeBytes).toBeGreaterThan(0);
    expect(body).not.toHaveProperty('filePath');
  });
});

describe('B7.4.5 — the stored file’s SHA-256 verifies on read', () => {
  it('matches what the row records', async () => {
    const { quote } = await sentQuote();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { filePath: true, fileHashSha256: true, sizeBytes: true },
    });

    const bytes = await readFile(path.join(storage.path, document.filePath));
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(
      document.fileHashSha256,
    );
    expect(bytes.byteLength).toBe(document.sizeBytes);
  });

  it('refuses to serve a file that has been altered on disk', async () => {
    // The integrity check runs on every download rather than in a maintenance
    // job (§4.2): if the authoritative record has been tampered with, the
    // moment a customer asks for their copy is when the workshop must find
    // out — and serving the altered bytes anyway defeats storing the hash.
    const { quote } = await sentQuote();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { filePath: true },
    });

    await writeFile(
      path.join(storage.path, document.filePath),
      Buffer.from('%PDF-1.7 tampered'),
    );

    await get(
      harness,
      agent,
      `/api/documents/${quote.documentId ?? ''}/file`,
    ).expect(500);
  });

  it('B7.6.2 — a missing file is an error, not an empty download', async () => {
    const { quote } = await sentQuote();
    await harness.app.prisma.document.update({
      where: { id: quote.documentId ?? '' },
      data: { filePath: 'documents/2026/09/does-not-exist.pdf' },
    });

    await get(
      harness,
      agent,
      `/api/documents/${quote.documentId ?? ''}/file`,
    ).expect(500);
  });

  it('B7.2.3 — a stored path that escapes the root is refused', async () => {
    // The filenames this application writes are safe by construction. The
    // assertion exists because a path read back out of a database row is a
    // boundary, and it is the one an attacker would aim at.
    const { quote } = await sentQuote();
    await harness.app.prisma.document.update({
      where: { id: quote.documentId ?? '' },
      data: { filePath: '../../../../etc/passwd' },
    });

    await get(
      harness,
      agent,
      `/api/documents/${quote.documentId ?? ''}/file`,
    ).expect(500);
  });
});

describe('B7.6.2 — the defined errors', () => {
  it('404s for a document that does not exist', async () => {
    await get(
      harness,
      agent,
      '/api/documents/00000000-0000-0000-0000-000000000000',
    ).expect(404);
    await get(
      harness,
      agent,
      '/api/documents/00000000-0000-0000-0000-000000000000/file',
    ).expect(404);
  });

  it('401s an unauthenticated download', async () => {
    // There is deliberately no public link. §6.6 has the PDF given by hand or
    // attached to an email a staff member sends themselves, so an anonymous,
    // guessable URL would expose every customer's name, car and prices.
    const { quote } = await sentQuote();

    await supertest(harness.app.server)
      .get(`/api/documents/${quote.documentId ?? ''}/file`)
      .expect(401);
    await supertest(harness.app.server)
      .get(`/api/documents/${quote.documentId ?? ''}`)
      .expect(401);
  });
});

describe('B7.6.3 — regeneration from payloadJson', () => {
  /**
   * B0.10.1 measured byte-identical regeneration with pinned dates, so this
   * takes B7.4.6's strict branch and asserts matching hashes.
   *
   * **The stored file remains authoritative regardless** (§8.3). This proves
   * that a lost file can be rebuilt from `payloadJson`; it does not weaken the
   * integrity check, which is over the bytes on disk and is asserted above.
   */
  it('rebuilds the identical file from the stored payload', async () => {
    const { quote } = await sentQuote();
    // Through the repository rather than a hand-written query: this is the
    // path B11's "rebuild a lost file" would take, and it should be the one
    // under test.
    const document = await findDocumentWithPayload(
      harness.app.prisma,
      quote.documentId ?? '',
    );
    if (document === null) {
      throw new Error('the sent quote has no document');
    }

    const payload = parseQuotePayload(document.payloadJson);
    const regenerated = await renderPdf(QuoteDocument(payload));

    expect(createHash('sha256').update(regenerated).digest('hex')).toBe(
      document.fileHashSha256,
    );

    const stored = await readFile(path.join(storage.path, document.filePath));
    expect(regenerated.equals(stored)).toBe(true);
  }, 60_000);

  it('stores a payload that still parses against its own schema', async () => {
    // The version field is the mechanism: when B8's template widens this
    // shape, an old document must be re-read by code that understands it
    // rather than coerced into the new one.
    const { quote } = await sentQuote();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { payloadJson: true },
    });

    const payload = parseQuotePayload(document.payloadJson);
    expect(payload.payloadVersion).toBe(1);
    expect(payload.documentType).toBe('QUOTE');
    expect(payload.number).toBe(quote.number);
    expect(payload.totals.grossOre).toBe(quote.totals.grossOre);
    expect(payload.lines).toHaveLength(quote.lines.length);
  });

  it('carries the customer as they were, not as they are', async () => {
    // §5.5: a customer anonymised on a GDPR request keeps their documents,
    // and those documents keep the name that was on them. A payload that
    // referenced the live row would rewrite a three-year-old offert to say
    // "Anonymiserad kund".
    const { quote } = await sentQuote();
    const document = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { payloadJson: true },
    });
    const before = parseQuotePayload(document.payloadJson).customer.name;

    await harness.app.prisma.customer.update({
      where: { id: quote.customer.id },
      data: { name: 'Anonymiserad kund' },
    });

    const after = await harness.app.prisma.document.findUniqueOrThrow({
      where: { id: quote.documentId ?? '' },
      select: { payloadJson: true },
    });
    expect(parseQuotePayload(after.payloadJson).customer.name).toBe(before);
    expect(before).not.toBe('Anonymiserad kund');
  });
});
