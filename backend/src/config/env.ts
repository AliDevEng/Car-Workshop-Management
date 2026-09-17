import { z } from 'zod';

/**
 * The one place in the backend that reads `process.env`.
 *
 * Everything else receives an `Env` object. That is enforced by ESLint
 * (`no-restricted-properties` on `process.env`, with this file exempted), not
 * by discipline — PROJECT_SPEC.md §5.4 and backend README B0.6.4.
 */

/** Placeholders shipped in `.env.example`. Never valid in production. */
const EXAMPLE_PLACEHOLDERS = new Set([
  '0'.repeat(64),
  'change-me-to-32-or-more-characters-long',
]);

const nodeEnvSchema = z.enum(['development', 'test', 'production']);

const logLevelSchema = z.enum([
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
]);

const vehicleDataProviderSchema = z.enum(['mock', 'biluppgifter']);

/** A URL used as a prefix elsewhere; a trailing slash produces `//api`. */
const baseUrlSchema = z
  .url()
  .refine((value) => !value.endsWith('/'), 'must not end with a slash');

const envShapeSchema = z.object({
  NODE_ENV: nodeEnvSchema.default('development'),

  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  LOG_LEVEL: logLevelSchema.default('info'),

  // Optional (PROJECT_SPEC.md §8.5, B12.6.1). Error tracking is wired but
  // stays off — `lib/sentry.ts` never calls `Sentry.init` — until a real DSN
  // is supplied.
  SENTRY_DSN: z.url().optional(),

  /**
   * Whether to read the client address from `X-Forwarded-For`.
   *
   * This is load-bearing rather than cosmetic. §2.3 puts Caddy in front of the
   * backend, and without it every request appears to come from the proxy —
   * which silently collapses §5.1's per-IP login limit and §5.4's global limit
   * into one bucket shared by every visitor on the internet, and stores one
   * `ipHash` for all of them (§5.5). The control would still be there, and it
   * would do nothing.
   *
   * Off by default because trusting the header when nothing strips it lets a
   * caller pick their own rate-limit bucket. It is turned on only where a
   * proxy that overwrites `X-Forwarded-For` is genuinely in front — which is
   * the deployment B12 builds.
   */
  TRUST_PROXY: z.stringbool().default(false),

  DATABASE_URL: z
    .string()
    .min(1)
    .refine(
      (value) =>
        value.startsWith('postgresql://') || value.startsWith('postgres://'),
      'must be a postgresql:// connection string',
    ),

  // 32 bytes, hex-encoded. Rotating it invalidates every session cookie.
  SESSION_COOKIE_SECRET: z
    .string()
    .regex(/^[0-9a-f]{64}$/i, 'must be exactly 64 hexadecimal characters'),

  IP_HASH_SALT: z.string().min(32, 'must be at least 32 characters'),
  FORM_TOKEN_SECRET: z.string().min(32, 'must be at least 32 characters'),

  PUBLIC_BASE_URL: baseUrlSchema,

  // Frontend-only (PROJECT_SPEC.md §2.3): server components call the backend
  // over the Docker network. Listed here because it belongs to the same .env,
  // optional because the backend never needs it and must not refuse to start
  // when only the frontend's half of the file is present.
  INTERNAL_API_URL: baseUrlSchema.optional(),

  VEHICLE_DATA_PROVIDER: vehicleDataProviderSchema.default('mock'),
  VEHICLE_DATA_API_KEY: z.string().min(1).optional(),
  VEHICLE_DATA_DAILY_LIMIT_STAFF: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(200),
  VEHICLE_DATA_DAILY_LIMIT_PUBLIC: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(100),

  STORAGE_PATH: z.string().min(1).default('./storage'),

  // Deliberately never set. Containers run UTC and every conversion is
  // explicit in code (PROJECT_SPEC.md §2.1, §3.6). Refusing to start on a
  // wrong value is the whole point: a container that happens to sit in
  // Europe/Stockholm hides timezone bugs until the day it is moved.
  TZ: z
    .string()
    .refine(
      (value) => value === 'UTC',
      'must be unset, or exactly "UTC". The application converts to ' +
        'Europe/Stockholm explicitly and must not inherit a process timezone.',
    )
    .optional(),
});

const envSchema = envShapeSchema.superRefine((env, ctx) => {
  if (
    env.VEHICLE_DATA_PROVIDER !== 'mock' &&
    env.VEHICLE_DATA_API_KEY === undefined
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['VEHICLE_DATA_API_KEY'],
      message: `is required when VEHICLE_DATA_PROVIDER is "${env.VEHICLE_DATA_PROVIDER}"`,
    });
  }

  if (env.NODE_ENV === 'production') {
    for (const key of [
      'SESSION_COOKIE_SECRET',
      'IP_HASH_SALT',
      'FORM_TOKEN_SECRET',
    ] as const) {
      if (EXAMPLE_PLACEHOLDERS.has(env[key])) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'is still the .env.example placeholder',
        });
      }
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * `KEY=` in a `.env` file means "not set", not "set to the empty string".
 * Without this, an optional variable left blank in the template — the normal
 * state of `VEHICLE_DATA_API_KEY` before Phase 6 — fails its own minimum
 * length and stops the process.
 */
function dropBlankValues(
  source: Record<string, string | undefined>,
): Record<string, string> {
  const entries = Object.entries(source).filter(
    (entry): entry is [string, string] =>
      entry[1] !== undefined && entry[1].trim() !== '',
  );
  return Object.fromEntries(entries);
}

/**
 * Validate an environment. Pure, so tests exercise every branch without
 * mutating the process.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  return envSchema.parse(dropBlankValues(source));
}

/** As `parseEnv`, but returns the Zod result instead of throwing. */
export function safeParseEnv(
  source: Record<string, string | undefined>,
): z.ZodSafeParseResult<Env> {
  return envSchema.safeParse(dropBlankValues(source));
}

/** Renders Zod issues as one line per variable, ordered and readable. */
export function formatEnvError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const variable = issue.path.join('.');
    return `  ${variable === '' ? '(root)' : variable}: ${issue.message}`;
  });
  return `Invalid environment configuration:\n${lines.join('\n')}`;
}

let cached: Env | undefined;

/**
 * Read and validate `process.env` once. On failure the process exits with a
 * readable message rather than starting and failing later at an arbitrary
 * point (PROJECT_SPEC.md §5.4).
 */
export function loadEnv(): Env {
  if (cached !== undefined) {
    return cached;
  }

  const result = safeParseEnv(process.env);
  if (!result.success) {
    process.stderr.write(`${formatEnvError(result.error)}\n`);
    process.exit(1);
  }

  cached = result.data;
  return cached;
}
