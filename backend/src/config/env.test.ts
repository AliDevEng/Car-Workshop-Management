import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { formatEnvError, parseEnv, safeParseEnv } from './env.js';

/**
 * B0.6.1–B0.6.2. `loadEnv` is not tested directly because it exits the
 * process; everything it does beyond that is `safeParseEnv` and
 * `formatEnvError`, which are pure.
 */

const valid: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://verkstad:verkstad@127.0.0.1:5433/verkstad',
  SESSION_COOKIE_SECRET: 'a'.repeat(64),
  IP_HASH_SALT: 's'.repeat(32),
  FORM_TOKEN_SECRET: 'f'.repeat(32),
  PUBLIC_BASE_URL: 'https://verkstaden.se',
};

function expectFailure(
  overrides: Record<string, string | undefined>,
): z.ZodError {
  const result = safeParseEnv({ ...valid, ...overrides });
  expect(result.success).toBe(false);
  if (result.success) {
    throw new Error('expected the environment to be rejected');
  }
  return result.error;
}

describe('environment validation', () => {
  it('accepts a minimal valid environment and applies defaults', () => {
    const env = parseEnv(valid);

    expect(env.PORT).toBe(3001);
    expect(env.HOST).toBe('127.0.0.1');
    expect(env.LOG_LEVEL).toBe('info');
    expect(env.VEHICLE_DATA_PROVIDER).toBe('mock');
    expect(env.VEHICLE_DATA_DAILY_LIMIT_STAFF).toBe(200);
    expect(env.VEHICLE_DATA_DAILY_LIMIT_PUBLIC).toBe(100);
    expect(env.STORAGE_PATH).toBe('./storage');
  });

  it('coerces numeric variables, which arrive as strings', () => {
    const env = parseEnv({ ...valid, PORT: '8080' });

    expect(env.PORT).toBe(8080);
    expect(typeof env.PORT).toBe('number');
  });

  it('treats a blank value as unset', () => {
    // `VEHICLE_DATA_API_KEY=` is the normal state of .env before Phase 6.
    const env = parseEnv({ ...valid, VEHICLE_DATA_API_KEY: '' });

    expect(env.VEHICLE_DATA_API_KEY).toBeUndefined();
  });

  it.each([
    ['DATABASE_URL', 'mysql://localhost/verkstad'],
    ['SESSION_COOKIE_SECRET', 'too-short'],
    ['IP_HASH_SALT', 'short'],
    ['FORM_TOKEN_SECRET', 'short'],
    ['PUBLIC_BASE_URL', 'not-a-url'],
    ['PORT', 'threethousand'],
    ['LOG_LEVEL', 'chatty'],
    ['NODE_ENV', 'staging'],
  ])('rejects a malformed %s', (key, value) => {
    const error = expectFailure({ [key]: value });

    expect(error.issues.some((issue) => issue.path[0] === key)).toBe(true);
  });

  it('rejects a trailing slash on a base URL', () => {
    expectFailure({ PUBLIC_BASE_URL: 'https://verkstaden.se/' });
  });

  it('requires an API key once the provider is no longer the mock', () => {
    const error = expectFailure({ VEHICLE_DATA_PROVIDER: 'biluppgifter' });

    expect(error.issues[0]?.path).toEqual(['VEHICLE_DATA_API_KEY']);
  });

  it('accepts the real provider when a key is present', () => {
    const env = parseEnv({
      ...valid,
      VEHICLE_DATA_PROVIDER: 'biluppgifter',
      VEHICLE_DATA_API_KEY: 'secret',
    });

    expect(env.VEHICLE_DATA_PROVIDER).toBe('biluppgifter');
  });

  it('refuses a process timezone other than UTC', () => {
    // Containers run UTC and convert explicitly (PROJECT_SPEC.md §3.6). A
    // container that happens to sit in Europe/Stockholm hides every DST bug.
    expectFailure({ TZ: 'Europe/Stockholm' });
    expect(parseEnv({ ...valid, TZ: 'UTC' }).TZ).toBe('UTC');
  });

  it('refuses the .env.example placeholders in production', () => {
    const error = expectFailure({
      NODE_ENV: 'production',
      SESSION_COOKIE_SECRET: '0'.repeat(64),
      IP_HASH_SALT: 'change-me-to-32-or-more-characters-long',
      FORM_TOKEN_SECRET: 'change-me-to-32-or-more-characters-long',
    });

    expect(error.issues.map((issue) => issue.path[0]).sort()).toEqual([
      'FORM_TOKEN_SECRET',
      'IP_HASH_SALT',
      'SESSION_COOKIE_SECRET',
    ]);
  });

  it('allows those same placeholders in development', () => {
    expect(() =>
      parseEnv({
        ...valid,
        NODE_ENV: 'development',
        SESSION_COOKIE_SECRET: '0'.repeat(64),
      }),
    ).not.toThrow();
  });

  it('names every offending variable in the failure message', () => {
    const error = expectFailure({
      DATABASE_URL: 'mysql://nope',
      IP_HASH_SALT: 'short',
    });
    const message = formatEnvError(error);

    expect(message).toContain('Invalid environment configuration');
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('IP_HASH_SALT');
  });
});
