import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../config/env.js';
import { PrismaClient } from '../generated/prisma/client.js';

/**
 * Prisma 7 talks to PostgreSQL through a driver adapter; the connection string
 * is no longer read from the schema (B0.4.4). Pool settings are explicit
 * rather than defaulted, because the default pool is sized for a serverless
 * process and this one is a long-lived container.
 */

export type Database = PrismaClient;

/**
 * Just the two methods this module calls. Depending on the capability rather
 * than on a concrete `pino.Logger` lets the Fastify request logger and a
 * standalone script logger (the seed) both be passed without adapting either.
 */
export type PrismaLogSink = {
  warn: (context: { target: string }, message: string) => void;
  error: (context: { target: string }, message: string) => void;
};

/** Small enough for a two-user workshop, large enough for the nightly jobs. */
const POOL_SIZE = 10;

export function createPrismaClient(env: Env, logger: PrismaLogSink): Database {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: POOL_SIZE,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    // A query that has not finished in 30 seconds is a bug, not slow hardware.
    statement_timeout: 30_000,
  });

  const prisma = new PrismaClient({
    adapter,
    // Events, not stdout. `console.log` is banned in the backend (CLAUDE.md)
    // and a Prisma warning printed outside Pino has no request id on it.
    log: [
      { emit: 'event', level: 'warn' },
      { emit: 'event', level: 'error' },
    ],
  });

  prisma.$on('warn', (event) => {
    logger.warn({ target: event.target }, event.message);
  });
  prisma.$on('error', (event) => {
    logger.error({ target: event.target }, event.message);
  });

  return prisma;
}
