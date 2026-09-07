import { pino } from 'pino';
import { loadDotEnv } from '../src/config/dotenv.js';
import { loadEnv } from '../src/config/env.js';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Development seed data. Wired through `prisma.config.ts#migrations.seed`
 * (Prisma 7 replaced `package.json#prisma.seed`) and always run explicitly —
 * `prisma migrate dev` no longer implies it (B0.4.8).
 *
 * B0 has no models yet. Each later iteration adds its own rows here: B2 the
 * two staff users, B3 customers and vehicles, B4 articles.
 */

loadDotEnv();
const env = loadEnv();

const logger = pino({ level: env.LOG_LEVEL });

if (env.NODE_ENV === 'production') {
  logger.fatal('Refusing to seed a production database.');
  process.exit(1);
}

const prisma = createPrismaClient(env, logger);

try {
  // Proves the connection and the adapter before any iteration relies on it.
  await prisma.$queryRaw`SELECT 1`;
  logger.info('Seed complete — no models defined yet (B0).');
} finally {
  await prisma.$disconnect();
}
