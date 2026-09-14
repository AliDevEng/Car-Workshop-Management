import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { UserRole } from 'shared';
import { runScheduledJob, type JobLogger } from '../src/jobs/lock.js';
import { reconcileStockLedger } from '../src/jobs/stock-reconciliation.js';
import { refreshServiceRecommendations } from '../src/jobs/recommendation-refresh.js';
import { runRetentionSweep } from '../src/jobs/retention.js';
import {
  cleanupExpiredIdempotencyKeys,
  cleanupExpiredSessions,
  runHourlyCleanup,
} from '../src/jobs/session-cleanup.js';
import { hashPassword } from '../src/lib/password.js';
import { createTestApp, type TestApp } from './helpers/app.js';
import { loginAs, type Agent } from './helpers/auth.js';
import { post, seedArticle, seedSubject } from './helpers/work-orders.js';

/**
 * Scheduled jobs (PROJECT_SPEC.md §8.4, B11.3–B11.5).
 *
 * Every job is a plain exported function (B11.3.7), so it is called directly
 * here with a real `Database` and no cron involved at all — `node-cron` and
 * `jobs/scheduler.ts` only decide *when* these run, never *what* they do.
 */

function silentLogger(): JobLogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

let harness: TestApp;
let admin: Agent;

beforeAll(async () => {
  harness = await createTestApp();
  admin = await loginAs(harness, { role: 'ADMIN' });
}, 180_000);

afterAll(async () => {
  await harness.close();
});

describe('reconcileStockLedger (B11.3.2)', () => {
  it('detects a cache that no longer matches the ledger sum, without correcting it', async () => {
    const articleId = await seedArticle(harness, admin.userId, {
      openingStock: '10',
    });

    // Simulate the exact drift the job exists to catch: the cache written
    // outside `recordMovement`'s lock, disagreeing with the ledger it is
    // supposed to mirror.
    await harness.app.prisma.article.update({
      where: { id: articleId },
      data: { stockQuantity: '999' },
    });

    const logger = silentLogger();
    const drifts = await reconcileStockLedger(harness.app.prisma, logger);

    const found = drifts.find((drift) => drift.articleId === articleId);
    expect(found).toBeDefined();
    expect(found?.cachedQuantity).toBe('999');
    expect(found?.ledgerQuantity).toBe('10');
    expect(found?.driftQuantity).toBe('989');
    expect(logger.warn).toHaveBeenCalled();

    // Detection only — the job must never silently rewrite a number the
    // workshop prices its parts against.
    const after = await harness.app.prisma.article.findUniqueOrThrow({
      where: { id: articleId },
      select: { stockQuantity: true },
    });
    expect(after.stockQuantity.toFixed()).toBe('999');
  });

  it('reports nothing for an article whose cache agrees with its ledger', async () => {
    // Scoped to this one article rather than asserting `logger.warn` was
    // never called at all: this file's harness is one shared database, and
    // the previous test's deliberately drifted article is still in it —
    // exactly the kind of leftover state B4's own concurrency tests warn
    // about accepting on faith.
    const articleId = await seedArticle(harness, admin.userId, {
      openingStock: '5',
    });

    const logger = silentLogger();
    const drifts = await reconcileStockLedger(harness.app.prisma, logger);

    expect(drifts.some((drift) => drift.articleId === articleId)).toBe(false);
  });
});

describe('refreshServiceRecommendations (B11.3.3)', () => {
  it('recomputes advice for a vehicle whose window shifted since it was last touched', async () => {
    const subject = await seedSubject(harness);
    const make = `Saab-${crypto.randomUUID().slice(0, 8)}`;

    await harness.app.prisma.vehicle.update({
      where: { id: subject.vehicleId },
      data: {
        make,
        firstRegistrationDate: new Date('2015-01-01T00:00:00.000Z'),
      },
    });

    await post(harness, admin, '/api/service-rules', {
      make,
      model: 'V70',
      serviceType: 'SERVICE_A',
      intervalKm: 1_000,
      sourceNote: 'Testad servicebok',
    }).expect(201);

    // Written directly, bypassing the odometer endpoint's own recompute
    // trigger (B9.6.1) — this is the "nobody has touched this car" state the
    // nightly scan exists to catch.
    await harness.app.prisma.vehicle.update({
      where: { id: subject.vehicleId },
      data: { lastKnownOdometerKm: 5_000 },
    });

    const before = await harness.app.prisma.serviceRecommendation.findMany({
      where: { vehicleId: subject.vehicleId },
    });
    expect(before).toHaveLength(0);

    const logger = silentLogger();
    await refreshServiceRecommendations(harness.app.prisma, logger);

    const after = await harness.app.prisma.serviceRecommendation.findMany({
      where: { vehicleId: subject.vehicleId },
    });
    expect(after).toHaveLength(1);
    expect(after[0]?.serviceType).toBe('SERVICE_A');
    expect(after[0]?.status).toBe('SUGGESTED');
  });
});

describe('runRetentionSweep (B11.3.4, §5.5)', () => {
  async function seedBookingRequest(
    status: 'PENDING' | 'REJECTED' | 'SPAM',
    submittedAt: Date,
  ): Promise<string> {
    const row = await harness.app.prisma.bookingRequest.create({
      data: {
        status,
        customerName: 'Behåll Namnet',
        phone: '070-000 00 00',
        email: 'behall@example.se',
        serviceTypeIds: [],
        submittedAt,
      },
      select: { id: true },
    });
    return row.id;
  }

  it('anonymises stale REJECTED/SPAM requests, and only those', async () => {
    const now = new Date('2026-09-14T04:30:00.000Z');
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
    const recent = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);

    const staleRejected = await seedBookingRequest('REJECTED', old);
    const staleSpam = await seedBookingRequest('SPAM', old);
    const freshRejected = await seedBookingRequest('REJECTED', recent);
    const stalePending = await seedBookingRequest('PENDING', old);

    const logger = silentLogger();
    const result = await runRetentionSweep(harness.app.prisma, logger, now);

    expect(result.bookingRequestsAnonymised).toBe(2);

    const rows = await harness.app.prisma.bookingRequest.findMany({
      where: { id: { in: [staleRejected, staleSpam, freshRejected, stalePending] } },
      select: { id: true, customerName: true, anonymisedAt: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    expect(byId.get(staleRejected)?.customerName).toBe('Raderad förfrågan');
    expect(byId.get(staleRejected)?.anonymisedAt).not.toBeNull();
    expect(byId.get(staleSpam)?.customerName).toBe('Raderad förfrågan');
    expect(byId.get(freshRejected)?.customerName).toBe('Behåll Namnet');
    expect(byId.get(stalePending)?.customerName).toBe('Behåll Namnet');
  });

  it('does not re-anonymise, or re-audit, a row it already handled', async () => {
    const now = new Date('2026-09-14T04:30:00.000Z');
    const old = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
    const id = await seedBookingRequest('SPAM', old);

    const logger = silentLogger();
    await runRetentionSweep(harness.app.prisma, logger, now);
    const secondResult = await runRetentionSweep(
      harness.app.prisma,
      logger,
      now,
    );

    expect(secondResult.bookingRequestsAnonymised).toBe(0);
    const entries = await harness.app.prisma.auditLog.findMany({
      where: { action: 'booking_request.anonymised', entityId: id },
    });
    expect(entries).toHaveLength(1);
  });

  it('anonymises a customer inactive for 36 months, but not a new or recently active one', async () => {
    const now = new Date('2026-09-14T04:30:00.000Z');
    const longAgo = new Date(now);
    longAgo.setUTCMonth(longAgo.getUTCMonth() - 40);
    const recently = new Date(now);
    recently.setUTCMonth(recently.getUTCMonth() - 1);

    const stale = await seedSubject(harness);
    await harness.app.prisma.customer.update({
      where: { id: stale.customerId },
      data: { createdAt: longAgo },
    });

    const staleWithOldOrder = await seedSubject(harness);
    await harness.app.prisma.customer.update({
      where: { id: staleWithOldOrder.customerId },
      data: { createdAt: longAgo },
    });
    await harness.app.prisma.workOrder.create({
      data: {
        vehicleId: staleWithOldOrder.vehicleId,
        customerId: staleWithOldOrder.customerId,
        description: 'Gammalt uppdrag',
        createdAt: longAgo,
      },
    });

    const activeCustomer = await seedSubject(harness);
    await harness.app.prisma.customer.update({
      where: { id: activeCustomer.customerId },
      data: { createdAt: longAgo },
    });
    await harness.app.prisma.workOrder.create({
      data: {
        vehicleId: activeCustomer.vehicleId,
        customerId: activeCustomer.customerId,
        description: 'Färskt uppdrag',
        createdAt: recently,
      },
    });

    const newCustomer = await seedSubject(harness);
    await harness.app.prisma.customer.update({
      where: { id: newCustomer.customerId },
      data: { createdAt: recently },
    });

    const logger = silentLogger();
    const result = await runRetentionSweep(harness.app.prisma, logger, now);

    expect(result.customersAnonymised).toBeGreaterThanOrEqual(2);

    const rows = await harness.app.prisma.customer.findMany({
      where: {
        id: {
          in: [
            stale.customerId,
            staleWithOldOrder.customerId,
            activeCustomer.customerId,
            newCustomer.customerId,
          ],
        },
      },
      select: { id: true, name: true },
    });
    const byId = new Map(rows.map((row) => [row.id, row.name]));

    expect(byId.get(stale.customerId)).toBe('Raderad kund');
    expect(byId.get(staleWithOldOrder.customerId)).toBe('Raderad kund');
    expect(byId.get(activeCustomer.customerId)).not.toBe('Raderad kund');
    expect(byId.get(newCustomer.customerId)).not.toBe('Raderad kund');
  });
});

describe('the hourly cleanup (B11.3.5, B11.5.3)', () => {
  async function seedUserId(): Promise<string> {
    const user = await harness.app.prisma.user.create({
      data: {
        email: `job-cleanup-${crypto.randomUUID()}@verkstaden.se`,
        name: 'Jobbanvändare',
        role: 'MECHANIC' satisfies UserRole,
        isActive: true,
        passwordHash: await hashPassword('irrelevant-password-2026'),
      },
      select: { id: true },
    });
    return user.id;
  }

  it('removes expired sessions and idempotency keys older than 24 hours', async () => {
    const now = new Date('2026-09-14T12:00:00.000Z');
    const userId = await seedUserId();

    const expiredSession = await harness.app.prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        expiresAt: new Date(now.getTime() - 60_000),
        lastSeenAt: new Date(now.getTime() - 120_000),
      },
      select: { id: true },
    });
    const activeSession = await harness.app.prisma.session.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        expiresAt: new Date(now.getTime() + 60_000),
        lastSeenAt: now,
      },
      select: { id: true },
    });

    const oldKey = 'job-cleanup-old-key';
    const freshKey = 'job-cleanup-fresh-key';
    await harness.app.prisma.idempotencyKey.create({
      data: {
        key: oldKey,
        userId,
        endpoint: 'TEST',
        requestHash: 'irrelevant',
        responseJson: {},
        statusCode: 200,
        createdAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      },
    });
    await harness.app.prisma.idempotencyKey.create({
      data: {
        key: freshKey,
        userId,
        endpoint: 'TEST',
        requestHash: 'irrelevant',
        responseJson: {},
        statusCode: 200,
        createdAt: new Date(now.getTime() - 60 * 60 * 1000),
      },
    });

    const sessionsDeleted = await cleanupExpiredSessions(
      harness.app.prisma,
      now,
    );
    const keysDeleted = await cleanupExpiredIdempotencyKeys(
      harness.app.prisma,
      now,
    );

    expect(sessionsDeleted).toBeGreaterThanOrEqual(1);
    expect(keysDeleted).toBe(1);

    expect(
      await harness.app.prisma.session.findUnique({
        where: { id: expiredSession.id },
      }),
    ).toBeNull();
    expect(
      await harness.app.prisma.session.findUnique({
        where: { id: activeSession.id },
      }),
    ).not.toBeNull();
    expect(
      await harness.app.prisma.idempotencyKey.findUnique({
        where: { key: oldKey },
      }),
    ).toBeNull();
    expect(
      await harness.app.prisma.idempotencyKey.findUnique({
        where: { key: freshKey },
      }),
    ).not.toBeNull();
  });

  it('runHourlyCleanup logs a combined summary', async () => {
    const logger = silentLogger();
    const result = await runHourlyCleanup(harness.app.prisma, logger);

    expect(result.sessionsDeleted).toBeGreaterThanOrEqual(0);
    expect(result.idempotencyKeysDeleted).toBeGreaterThanOrEqual(0);
    expect(logger.info).toHaveBeenCalled();
  });
});

describe('runScheduledJob — the advisory lock (B11.3.1, B11.5.1)', () => {
  it('lets a second, concurrent call for the same key skip rather than double-run', async () => {
    const lockKey = 424_242n;
    let running = 0;
    let concurrentRuns = 0;

    const job = {
      name: 'test-job',
      lockKey,
      run: async () => {
        running += 1;
        if (running > 1) {
          concurrentRuns += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 150));
        running -= 1;
      },
    };

    const logger = silentLogger();
    await Promise.all([
      runScheduledJob(harness.app.prisma, logger, job),
      runScheduledJob(harness.app.prisma, logger, job),
    ]);

    expect(concurrentRuns).toBe(0);
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ ran: false }),
      expect.stringContaining('skipped'),
    );
  });

  it('never throws into the caller when the job itself fails (B11.3.6)', async () => {
    const logger = silentLogger();

    await expect(
      runScheduledJob(harness.app.prisma, logger, {
        name: 'failing-job',
        lockKey: 424_243n,
        run: () => {
          throw new Error('deliberate failure for the test');
        },
      }),
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ job: 'failing-job' }),
      'Scheduled job failed',
    );
  });
});
