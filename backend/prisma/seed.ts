import { pino } from 'pino';
import { loadDotEnv } from '../src/config/dotenv.js';
import { loadEnv } from '../src/config/env.js';
import { hashPassword } from '../src/lib/password.js';
import { createPrismaClient } from '../src/lib/prisma.js';

/**
 * Development seed data. Wired through `prisma.config.ts#migrations.seed`
 * (Prisma 7 replaced `package.json#prisma.seed`) and always run explicitly —
 * `prisma migrate dev` no longer implies it (B0.4.8).
 *
 * Each iteration adds its own rows: B2 the two staff users, B3 customers and
 * vehicles, B4 articles.
 */

loadDotEnv();
const env = loadEnv();

const logger = pino({ level: env.LOG_LEVEL });

if (env.NODE_ENV === 'production') {
  logger.fatal('Refusing to seed a production database.');
  process.exit(1);
}

/**
 * Development credentials, printed below so they are discoverable without
 * reading this file. They are safe to hard-code precisely because the guard
 * above makes this script refuse to run against production — and because
 * `.env`'s placeholder secrets are rejected there too (B0.6.3).
 */
const SEED_USERS = [
  {
    email: 'admin@verkstaden.se',
    name: 'Anna Andersson',
    role: 'ADMIN',
    password: 'utveckling-admin-2026',
  },
  {
    email: 'mekaniker@verkstaden.se',
    name: 'Björn Bergström',
    role: 'MECHANIC',
    password: 'utveckling-mekaniker-2026',
  },
] as const;

const prisma = createPrismaClient(env, logger);

try {
  for (const seedUser of SEED_USERS) {
    // Upsert, not create: seeding twice is a normal thing to do while
    // developing, and it must not fail on the unique email.
    await prisma.user.upsert({
      where: { email: seedUser.email },
      update: {},
      create: {
        email: seedUser.email,
        name: seedUser.name,
        role: seedUser.role,
        passwordHash: await hashPassword(seedUser.password),
      },
    });
  }

  logger.info(
    { users: SEED_USERS.map((user) => `${user.email} / ${user.password}`) },
    'Seed complete — staff users ready (B2).',
  );
} finally {
  await prisma.$disconnect();
}
