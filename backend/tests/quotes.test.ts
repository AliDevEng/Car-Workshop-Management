import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addStockholmDays,
  calculateWorkOrderTotals,
  ore,
  parseDecimal,
  quoteDetailSchema,
  quoteListResponseSchema,
  quoteResponseSchema,
  stockholmDate,
  type QuoteResponse,
} from 'shared';
import { expireOverdueQuotes } from '../src/modules/quotes/service.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { jsonBody } from './helpers/http.js';
import { createStorageRoot } from './helpers/quotes.js';
import {
  get,
  labourLine,
  partLine,
  patch,
  post,
  seedArticle,
  seedSubject,
} from './helpers/work-orders.js';

/**
 * Quotes end to end (B7.3, B7.5).
 *
 * Everything goes through the real API. Work orders, customers and articles
 * are seeded through their own paths because B3, B4 and B6 already cover
 * those, and a quote test failing because a vehicle could not be created tells
 * nobody anything about quotes.
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

/** A work order with one labour line and one stocked part, ready to quote. */
async function seedQuotableWorkOrder(): Promise<{
  workOrderId: string;
  articleId: string;
}> {
  const subject = await seedSubject(harness);
  const articleId = await seedArticle(harness, agent.userId);

  const created = await post(harness, agent, '/api/work-orders', {
    vehicleId: subject.vehicleId,
    customerId: subject.customerId,
    description: 'Årlig service och bromsvätskebyte',
  }).expect(201);

  const body = jsonBody(created);
  const workOrderId =
    typeof body === 'object' && body !== null && 'workOrder' in body
      ? String((body.workOrder as { id: string }).id)
      : '';

  await post(harness, agent, `/api/work-orders/${workOrderId}/lines`, {
    ...labourLine(),
  }).expect(201);
  await post(harness, agent, `/api/work-orders/${workOrderId}/lines`, {
    ...partLine(articleId),
  }).expect(201);

  return { workOrderId, articleId };
}

async function createQuote(workOrderId: string): Promise<QuoteResponse> {
  const response = await post(
    harness,
    agent,
    `/api/work-orders/${workOrderId}/quotes`,
    {},
  ).expect(201);
  return quoteResponseSchema.parse(jsonBody(response));
}

async function sendQuote(quoteId: string): Promise<QuoteResponse> {
  const response = await post(
    harness,
    agent,
    `/api/quotes/${quoteId}/send`,
  ).expect(200);
  return quoteResponseSchema.parse(jsonBody(response));
}

describe('B7.3.2 — creating a quote snapshots the work order', () => {
  it('copies the lines and freezes the totals', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const { quote } = await createQuote(workOrderId);

    expect(quote.status).toBe('DRAFT');
    expect(quote.revision).toBe(1);
    expect(quote.lines).toHaveLength(2);
    expect(quote.lines.map((line) => line.description)).toEqual([
      'Service, 1 timme',
      'Motorolja 5W-30',
    ]);

    // Exactly what §3.3 prescribes: each line rounded, then summed.
    const expected = calculateWorkOrderTotals([
      {
        unitPriceOre: ore(89_500),
        quantity: parseDecimal('1'),
        vatRateBps: 2500,
      },
      {
        unitPriceOre: ore(12_999),
        quantity: parseDecimal('4'),
        vatRateBps: 2500,
      },
    ]);
    expect(quote.totals.netOre).toBe(expected.totals.netOre);
    expect(quote.totals.vatOre).toBe(expected.totals.vatOre);
    expect(quote.totals.grossOre).toBe(expected.totals.grossOre);
    expect(quote.totals.roundingOre).toBe(expected.totals.roundingOre);
  });

  it('reports document totals that equal the sum of its own line totals', async () => {
    // The one place this codebase stores a total instead of computing it, so
    // the two have to be shown to agree. §3.3's trap is a document total that
    // was computed a different way from the lines beside it.
    const { workOrderId } = await seedQuotableWorkOrder();
    const { quote } = await createQuote(workOrderId);

    const summed = quote.lines.reduce(
      (accumulator, line) => ({
        netOre: accumulator.netOre + line.totals.netOre,
        vatOre: accumulator.vatOre + line.totals.vatOre,
        grossOre: accumulator.grossOre + line.totals.grossOre,
      }),
      { netOre: 0, vatOre: 0, grossOre: 0 },
    );

    expect(summed.netOre).toBe(quote.totals.netOre);
    expect(summed.vatOre).toBe(quote.totals.vatOre);
    expect(summed.grossOre).toBe(quote.totals.grossOre);
    expect(quote.totals.roundedGrossOre).toBe(
      quote.totals.grossOre + quote.totals.roundingOre,
    );
  });

  it('does not follow the work order when its lines change afterwards', async () => {
    // §6.6: what the customer received always still exists. This is the same
    // snapshot rule §4.2 applies between a line and its article, one level up.
    const { workOrderId } = await seedQuotableWorkOrder();
    const { quote } = await createQuote(workOrderId);
    const frozen = quote.totals.grossOre;

    await post(harness, agent, `/api/work-orders/${workOrderId}/lines`, {
      ...labourLine({ description: 'Extra arbete', unitPriceOre: 50_000 }),
    }).expect(201);

    const after = quoteDetailSchema.parse(
      jsonBody(
        await get(harness, agent, `/api/quotes/${quote.id}`).expect(200),
      ),
    );

    expect(after.lines).toHaveLength(2);
    expect(after.totals.grossOre).toBe(frozen);
  });

  it('starts without a number, so an abandoned draft leaves no gap', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const { quote } = await createQuote(workOrderId);
    expect(quote.number).toBeNull();
  });

  it('creates a second, independent quote on the same work order', async () => {
    // Found in review. Every quote on an order takes the next revision, not
    // just a revision of a sent one — defaulting a plain create to revision 1
    // made "quote it, abandon the draft, quote it again" collide with the
    // `(workOrderId, revision)` unique index and answer `409 — uppgifterna
    // krockar med något som redan finns`, which is both wrong and
    // unactionable.
    const { workOrderId } = await seedQuotableWorkOrder();

    const first = await createQuote(workOrderId);
    const second = await createQuote(workOrderId);

    expect(first.quote.revision).toBe(1);
    expect(second.quote.revision).toBe(2);
    // Independent, not a revision: nothing was superseded, because the first
    // quote was never sent to anybody.
    expect(second.quote.supersedesQuoteId).toBeNull();
  });

  it('defaults validUntil from the quoteValidityDays setting', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const { quote } = await createQuote(workOrderId);

    // The default operational setting is 30 days (config/settings.ts),
    // counted from the workshop's own Stockholm calendar date — exactly what
    // `defaultValidUntil` in `quotes/service.ts` does. Naive UTC-millisecond
    // arithmetic here would disagree with it for part of every day (§3.6),
    // which is the trap this test would otherwise fall into itself.
    const expected = addStockholmDays(stockholmDate(new Date()), 30);
    expect(quote.validUntil).toBe(expected);
  });

  it('accepts an explicit validUntil', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const response = await post(
      harness,
      agent,
      `/api/work-orders/${workOrderId}/quotes`,
      { validUntil: '2027-01-15' },
    ).expect(201);

    expect(quoteResponseSchema.parse(jsonBody(response)).quote.validUntil).toBe(
      '2027-01-15',
    );
  });

  it('refuses a work order with no lines', async () => {
    const subject = await seedSubject(harness);
    const created = jsonBody(
      await post(harness, agent, '/api/work-orders', {
        vehicleId: subject.vehicleId,
        customerId: subject.customerId,
        description: 'Tom order',
      }).expect(201),
    );
    const id = String((created as { workOrder: { id: string } }).workOrder.id);

    await post(harness, agent, `/api/work-orders/${id}/quotes`, {}).expect(409);
  });

  it('refuses a cancelled work order', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const current = jsonBody(
      await get(harness, agent, `/api/work-orders/${workOrderId}`).expect(200),
    );
    const version = Number((current as { version: number }).version);

    await post(harness, agent, `/api/work-orders/${workOrderId}/status`, {
      status: 'CANCELLED',
      version,
    }).expect(200);

    await post(
      harness,
      agent,
      `/api/work-orders/${workOrderId}/quotes`,
      {},
    ).expect(409);
  });

  it('404s for a work order that does not exist', async () => {
    await post(
      harness,
      agent,
      '/api/work-orders/00000000-0000-0000-0000-000000000000/quotes',
      {},
    ).expect(404);
  });
});

describe('B7.3.3 and B7.5 — sending freezes the quote', () => {
  it('assigns a number, writes a document and moves to SENT', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    const { quote } = await sendQuote(draft.quote.id);

    expect(quote.status).toBe('SENT');
    expect(quote.number).toMatch(/^OF-\d{4}-\d{4}$/);
    expect(quote.documentId).not.toBeNull();
    expect(quote.sentAt).not.toBeNull();
  });

  it('draws numbers from a sequence, without gaps or repeats', async () => {
    const numbers: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      const { workOrderId } = await seedQuotableWorkOrder();
      const draft = await createQuote(workOrderId);
      const sent = await sendQuote(draft.quote.id);
      numbers.push(sent.quote.number ?? '');
    }

    const sequence = numbers.map((value) => Number(value.slice(-4)));
    expect(new Set(numbers).size).toBe(3);
    expect(sequence[1]).toBe((sequence[0] ?? 0) + 1);
    expect(sequence[2]).toBe((sequence[1] ?? 0) + 1);
  });

  it('B7.5.3 — a PATCH on a sent quote returns 409', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    await sendQuote(draft.quote.id);

    await patch(harness, agent, `/api/quotes/${draft.quote.id}`, {
      validUntil: '2027-01-01',
    }).expect(409);
  });

  it('allows a PATCH while the quote is still a draft', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);

    const updated = quoteResponseSchema.parse(
      jsonBody(
        await patch(harness, agent, `/api/quotes/${draft.quote.id}`, {
          validUntil: '2027-02-28',
        }).expect(200),
      ),
    );

    expect(updated.quote.validUntil).toBe('2027-02-28');
    expect(updated.quote.status).toBe('DRAFT');
  });

  it('refuses a second send', async () => {
    // The state machine, not the numbering: a double-tapped *Skicka* must not
    // reach the point of spending a second `OF-` number.
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    await sendQuote(draft.quote.id);

    await post(harness, agent, `/api/quotes/${draft.quote.id}/send`).expect(
      409,
    );
  });

  it('replays a send carrying the same Idempotency-Key', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    const key = `send-${crypto.randomUUID()}`;

    const first = quoteResponseSchema.parse(
      jsonBody(
        await post(harness, agent, `/api/quotes/${draft.quote.id}/send`)
          .set('idempotency-key', key)
          .expect(200),
      ),
    );
    const replay = quoteResponseSchema.parse(
      jsonBody(
        await post(harness, agent, `/api/quotes/${draft.quote.id}/send`)
          .set('idempotency-key', key)
          .expect(200),
      ),
    );

    // The same answer, and — crucially — the same document. A second document
    // would mean a second number and a second PDF for one quote.
    expect(replay.quote.number).toBe(first.quote.number);
    expect(replay.quote.documentId).toBe(first.quote.documentId);

    const documents = await harness.app.prisma.document.count({
      where: { number: first.quote.number ?? '' },
    });
    expect(documents).toBe(1);
  });
});

describe('B7.3.3 — recording the customer’s answer', () => {
  it('accepts and declines a sent quote', async () => {
    for (const status of ['ACCEPTED', 'DECLINED'] as const) {
      const { workOrderId } = await seedQuotableWorkOrder();
      const draft = await createQuote(workOrderId);
      await sendQuote(draft.quote.id);

      const answered = quoteResponseSchema.parse(
        jsonBody(
          await post(harness, agent, `/api/quotes/${draft.quote.id}/respond`, {
            status,
          }).expect(200),
        ),
      );

      expect(answered.quote.status).toBe(status);
      expect(answered.quote.respondedAt).not.toBeNull();
    }
  });

  it('refuses to answer a draft', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);

    await post(harness, agent, `/api/quotes/${draft.quote.id}/respond`, {
      status: 'ACCEPTED',
    }).expect(409);
  });

  it('refuses to answer twice', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    await sendQuote(draft.quote.id);

    await post(harness, agent, `/api/quotes/${draft.quote.id}/respond`, {
      status: 'ACCEPTED',
    }).expect(200);
    await post(harness, agent, `/api/quotes/${draft.quote.id}/respond`, {
      status: 'DECLINED',
    }).expect(409);
  });

  it('still accepts an answer after the validity date has passed', async () => {
    // The customer who rings back a day late is a customer. `EXPIRED` means
    // nobody answered, not that the workshop stopped listening.
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await post(
      harness,
      agent,
      `/api/work-orders/${workOrderId}/quotes`,
      { validUntil: '2020-01-01' },
    ).expect(201);
    const quoteId = quoteResponseSchema.parse(jsonBody(draft)).quote.id;
    await sendQuote(quoteId);

    await post(harness, agent, `/api/quotes/${quoteId}/respond`, {
      status: 'ACCEPTED',
    }).expect(200);
  });
});

describe('B7.5.1 and B7.5.2 — versions', () => {
  it('creates the next version of a sent quote from the current lines', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const first = await createQuote(workOrderId);
    await sendQuote(first.quote.id);

    await post(harness, agent, `/api/work-orders/${workOrderId}/lines`, {
      ...labourLine({
        description: 'Tillkommande arbete',
        unitPriceOre: 40_000,
      }),
    }).expect(201);

    const revised = quoteResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          agent,
          `/api/quotes/${first.quote.id}/revise`,
          {},
        ).expect(201),
      ),
    );

    expect(revised.quote.id).not.toBe(first.quote.id);
    expect(revised.quote.revision).toBe(2);
    expect(revised.quote.supersedesQuoteId).toBe(first.quote.id);
    expect(revised.quote.status).toBe('DRAFT');
    expect(revised.quote.lines).toHaveLength(3);
  });

  it('leaves the superseded quote and its document untouched', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const first = await createQuote(workOrderId);
    const sent = await sendQuote(first.quote.id);

    await post(
      harness,
      agent,
      `/api/quotes/${first.quote.id}/revise`,
      {},
    ).expect(201);

    const original = quoteDetailSchema.parse(
      jsonBody(
        await get(harness, agent, `/api/quotes/${first.quote.id}`).expect(200),
      ),
    );

    expect(original.status).toBe('SENT');
    expect(original.number).toBe(sent.quote.number);
    expect(original.documentId).toBe(sent.quote.documentId);
    expect(original.totals.grossOre).toBe(sent.quote.totals.grossOre);
  });

  it('refuses to revise the same quote twice', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const first = await createQuote(workOrderId);
    await sendQuote(first.quote.id);

    await post(
      harness,
      agent,
      `/api/quotes/${first.quote.id}/revise`,
      {},
    ).expect(201);
    await post(
      harness,
      agent,
      `/api/quotes/${first.quote.id}/revise`,
      {},
    ).expect(409);
  });

  it('refuses to revise a draft — a draft is edited directly', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);

    await post(
      harness,
      agent,
      `/api/quotes/${draft.quote.id}/revise`,
      {},
    ).expect(409);
  });

  it('lists every version on the work order', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const first = await createQuote(workOrderId);
    await sendQuote(first.quote.id);
    await post(
      harness,
      agent,
      `/api/quotes/${first.quote.id}/revise`,
      {},
    ).expect(201);

    const list = quoteListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/work-orders/${workOrderId}/quotes`,
        ).expect(200),
      ),
    );

    expect(list.data).toHaveLength(2);
    expect(list.data.map((item) => item.revision).sort()).toEqual([1, 2]);
  });

  it('404s listing versions of a work order that does not exist', async () => {
    await get(
      harness,
      agent,
      '/api/work-orders/00000000-0000-0000-0000-000000000000/quotes',
    ).expect(404);
  });
});

describe('the quote list', () => {
  it('filters by status', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    await sendQuote(draft.quote.id);

    const list = quoteListResponseSchema.parse(
      jsonBody(
        await get(harness, agent, '/api/quotes?status=SENT&limit=100').expect(
          200,
        ),
      ),
    );

    expect(list.data.length).toBeGreaterThan(0);
    expect(list.data.every((item) => item.status === 'SENT')).toBe(true);
    expect(list.data.some((item) => item.id === draft.quote.id)).toBe(true);
  });

  it('carries totals and a line count rather than the lines', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);

    const list = quoteListResponseSchema.parse(
      jsonBody(
        await get(
          harness,
          agent,
          `/api/quotes?workOrderId=${workOrderId}`,
        ).expect(200),
      ),
    );

    const item = list.data.find((row) => row.id === draft.quote.id);
    expect(item?.lineCount).toBe(2);
    expect(item?.totals.grossOre).toBe(draft.quote.totals.grossOre);
  });

  it('404s for a quote that does not exist', async () => {
    await get(
      harness,
      agent,
      '/api/quotes/00000000-0000-0000-0000-000000000000',
    ).expect(404);
  });
});

describe('B7.3.3 — the expiry sweep', () => {
  it('expires a sent quote whose validity has passed, and leaves today’s alone', async () => {
    const overdue = await seedQuotableWorkOrder();
    const overdueQuote = quoteResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          agent,
          `/api/work-orders/${overdue.workOrderId}/quotes`,
          { validUntil: '2026-06-30' },
        ).expect(201),
      ),
    );
    await sendQuote(overdueQuote.quote.id);

    const current = await seedQuotableWorkOrder();
    const currentQuote = quoteResponseSchema.parse(
      jsonBody(
        await post(
          harness,
          agent,
          `/api/work-orders/${current.workOrderId}/quotes`,
          { validUntil: '2026-07-01' },
        ).expect(201),
      ),
    );
    await sendQuote(currentQuote.quote.id);

    // 1 July in Stockholm, which is the last day the second quote is valid.
    const result = await expireOverdueQuotes(
      harness.app.prisma,
      new Date('2026-07-01T10:00:00.000Z'),
    );

    expect(result.expired).toBeGreaterThanOrEqual(1);
    expect(
      (
        await harness.app.prisma.quote.findUniqueOrThrow({
          where: { id: overdueQuote.quote.id },
          select: { status: true },
        })
      ).status,
    ).toBe('EXPIRED');
    expect(
      (
        await harness.app.prisma.quote.findUniqueOrThrow({
          where: { id: currentQuote.quote.id },
          select: { status: true },
        })
      ).status,
    ).toBe('SENT');
  });

  it('does not touch a quote that has already been answered', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = quoteResponseSchema.parse(
      jsonBody(
        await post(harness, agent, `/api/work-orders/${workOrderId}/quotes`, {
          validUntil: '2026-06-30',
        }).expect(201),
      ),
    );
    await sendQuote(draft.quote.id);
    await post(harness, agent, `/api/quotes/${draft.quote.id}/respond`, {
      status: 'ACCEPTED',
    }).expect(200);

    await expireOverdueQuotes(
      harness.app.prisma,
      new Date('2026-08-01T10:00:00.000Z'),
    );

    expect(
      (
        await harness.app.prisma.quote.findUniqueOrThrow({
          where: { id: draft.quote.id },
          select: { status: true },
        })
      ).status,
    ).toBe('ACCEPTED');
  });

  it('audits each expiry with no actor, because a job is not a person', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = quoteResponseSchema.parse(
      jsonBody(
        await post(harness, agent, `/api/work-orders/${workOrderId}/quotes`, {
          validUntil: '2026-05-31',
        }).expect(201),
      ),
    );
    await sendQuote(draft.quote.id);

    await expireOverdueQuotes(
      harness.app.prisma,
      new Date('2026-06-01T10:00:00.000Z'),
    );

    const entry = await harness.app.prisma.auditLog.findFirst({
      where: { entityId: draft.quote.id, action: 'quote.expired' },
      select: { userId: true },
    });

    expect(entry).not.toBeNull();
    expect(entry?.userId).toBeNull();
  });
});

describe('§4.2 — the mutations are audited', () => {
  it('records creation and sending', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);
    await sendQuote(draft.quote.id);

    const actions = (
      await harness.app.prisma.auditLog.findMany({
        where: { entityType: 'Quote', entityId: draft.quote.id },
        select: { action: true, userId: true },
        orderBy: { at: 'asc' },
      })
    ).map((entry) => entry.action);

    expect(actions).toEqual(['quote.created', 'quote.sent']);
  });
});

describe('§5.3 — authorisation', () => {
  it('refuses an unauthenticated caller', async () => {
    const { workOrderId } = await seedQuotableWorkOrder();
    const draft = await createQuote(workOrderId);

    const supertest = (await import('supertest')).default;
    await supertest(harness.app.server)
      .get(`/api/quotes/${draft.quote.id}`)
      .expect(401);
  });

  it('lets a mechanic quote a job', async () => {
    // §5.3 reserves ADMIN for prices, users, rules, links and settings. A
    // mechanic who cannot put a price in writing writes it on a job card.
    const mechanic = await loginAs(harness, { role: 'MECHANIC' });
    const { workOrderId } = await seedQuotableWorkOrder();

    await post(
      harness,
      mechanic,
      `/api/work-orders/${workOrderId}/quotes`,
      {},
    ).expect(201);
  });
});
