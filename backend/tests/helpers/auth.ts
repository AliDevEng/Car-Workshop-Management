import supertest from 'supertest';
import {
  CSRF_COOKIE_NAME,
  CSRF_TOKEN_HEADER,
  SESSION_COOKIE_NAME,
  type UserRole,
} from 'shared';
import { hashPassword } from '../../src/lib/password.js';
import type { TestApp } from './app.js';

/**
 * Creating staff and signing in, for the B2 route tests.
 *
 * Everything here goes through the real API, not through fixtures poked into
 * the database: a helper that forges a session cookie would pass whether or
 * not login works, which is the opposite of what these tests are for.
 */

/**
 * One shared argon2 hash for every seeded test user.
 *
 * The parameters are the production ones (19 MiB, two passes), so hashing per
 * user would add ~40 ms each across a suite that creates dozens. The password
 * is identical for all of them anyway; only the login tests need a distinct
 * one, and they ask for it explicitly.
 */
let sharedHash: Promise<string> | undefined;

export const TEST_PASSWORD = 'test-password-2026';

function getSharedHash(): Promise<string> {
  sharedHash ??= hashPassword(TEST_PASSWORD);
  return sharedHash;
}

export type SeedUserOptions = {
  readonly email?: string;
  readonly name?: string;
  readonly role?: UserRole;
  readonly password?: string;
  readonly isActive?: boolean;
};

export async function seedUser(
  harness: TestApp,
  options: SeedUserOptions = {},
): Promise<{ id: string; email: string; password: string }> {
  const email = options.email ?? `user-${crypto.randomUUID()}@verkstaden.se`;
  const password = options.password ?? TEST_PASSWORD;

  const user = await harness.app.prisma.user.create({
    data: {
      email,
      name: options.name ?? 'Testanvändare',
      role: options.role ?? 'MECHANIC',
      isActive: options.isActive ?? true,
      passwordHash:
        options.password === undefined
          ? await getSharedHash()
          : await hashPassword(options.password),
    },
    select: { id: true },
  });

  return { id: user.id, email, password };
}

/**
 * An authenticated client. Holds the cookies a browser would hold, and sends
 * the CSRF header a browser would have to send.
 */
export type Agent = {
  readonly cookies: readonly string[];
  readonly csrfToken: string;
  readonly userId: string;
};

function collectCookies(setCookie: readonly string[]): Map<string, string> {
  const jar = new Map<string, string>();
  for (const raw of setCookie) {
    const [pair] = raw.split(';');
    if (pair === undefined) {
      continue;
    }
    const separator = pair.indexOf('=');
    if (separator > 0) {
      jar.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }
  return jar;
}

export function readSetCookie(headers: Record<string, unknown>): string[] {
  const raw: unknown = headers['set-cookie'];
  if (Array.isArray(raw)) {
    return raw.filter((value): value is string => typeof value === 'string');
  }
  return typeof raw === 'string' ? [raw] : [];
}

export function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/**
 * The anonymous CSRF bootstrap every client needs before its first unsafe
 * request (§5.2). A browser gets this from the login page's own fetch; a test
 * has to ask for it, and doing so here means the tests exercise the same
 * sequence the frontend will.
 */
export async function bootstrapCsrf(
  harness: TestApp,
): Promise<{ jar: Map<string, string>; token: string }> {
  const response = await supertest(harness.app.server)
    .get('/api/auth/csrf')
    .expect(200);

  const jar = collectCookies(readSetCookie(response.headers));
  const body: unknown = JSON.parse(response.text);
  const token =
    typeof body === 'object' && body !== null && 'token' in body
      ? String(body.token)
      : '';

  return { jar, token };
}

/**
 * An unauthenticated client that can still make unsafe requests.
 *
 * §5.2 protects every unsafe method, login included, so even a test that has
 * nothing to do with authentication needs a token to POST anything. This is
 * the same two-step a browser performs: one safe request to receive the
 * binding, then the token on everything after it.
 */
export async function anonymousAgent(harness: TestApp): Promise<Agent> {
  const bootstrap = await bootstrapCsrf(harness);
  return {
    cookies: [...bootstrap.jar].map(([name, value]) => `${name}=${value}`),
    csrfToken: bootstrap.token,
    userId: '',
  };
}

/**
 * A login attempt that is allowed to fail. Bootstraps CSRF first, exactly as
 * a browser would, so a rejection is about the credentials rather than about
 * a missing token.
 */
export async function attemptLogin(
  harness: TestApp,
  email: string,
  password: string,
): Promise<supertest.Response> {
  const bootstrap = await bootstrapCsrf(harness);

  return supertest(harness.app.server)
    .post('/api/auth/login')
    .set('cookie', cookieHeader(bootstrap.jar))
    .set(CSRF_TOKEN_HEADER, bootstrap.token)
    .send({ email, password });
}

/** Signs in through `POST /api/auth/login` and captures the resulting cookies. */
export async function login(
  harness: TestApp,
  email: string,
  password: string = TEST_PASSWORD,
): Promise<Agent> {
  const bootstrap = await bootstrapCsrf(harness);

  const response = await supertest(harness.app.server)
    .post('/api/auth/login')
    .set('cookie', cookieHeader(bootstrap.jar))
    .set(CSRF_TOKEN_HEADER, bootstrap.token)
    .send({ email, password })
    .expect(200);

  // Login rebinds the token to the new session id, so its cookies replace the
  // anonymous ones rather than adding to them.
  const jar = new Map([
    ...bootstrap.jar,
    ...collectCookies(readSetCookie(response.headers)),
  ]);
  const session = jar.get(SESSION_COOKIE_NAME);
  const csrfToken = jar.get(CSRF_COOKIE_NAME);

  if (session === undefined || csrfToken === undefined) {
    throw new Error(
      'Login did not set both the session and CSRF cookies — the double ' +
        'submit cannot work without the second, and §5.2 requires it to be ' +
        'reissued whenever the session id changes.',
    );
  }

  const body: unknown = JSON.parse(response.text);
  const userId =
    typeof body === 'object' && body !== null && 'id' in body
      ? String(body.id)
      : '';

  return {
    cookies: [...jar].map(([name, value]) => `${name}=${value}`),
    csrfToken: decodeURIComponent(csrfToken),
    userId,
  };
}

/** Creates a user and signs in as them, which is what most tests want. */
export async function loginAs(
  harness: TestApp,
  options: SeedUserOptions = {},
): Promise<Agent> {
  const user = await seedUser(harness, options);
  return login(harness, user.email, user.password);
}

/** Applies an agent's cookies and CSRF header to a supertest request. */
export function withAgent<
  T extends { set: (field: string, value: string) => T },
>(request: T, agent: Agent): T {
  return request
    .set('cookie', agent.cookies.join('; '))
    .set(CSRF_TOKEN_HEADER, agent.csrfToken);
}
