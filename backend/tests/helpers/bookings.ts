import supertest from 'supertest';
import { issueFormToken } from '../../src/lib/form-token.js';
import type { TestApp } from './app.js';

/**
 * Fixtures for the B5 booking tests.
 *
 * The public form is deliberately hard to submit to — a signed timestamp that
 * has to be at least three seconds old, three per IP per hour, twenty a day.
 * That is the feature working, and it is also why the staff-side tests seed a
 * request row directly instead of going through the form: they are about what
 * a human does with a request, not about how it arrived.
 */

/**
 * A token that is already old enough to clear the time trap.
 *
 * Waiting three real seconds per test would make the suite unusable, and
 * mocking the clock inside the running server is worse — this signs a real
 * token with the same secret the app was built with, so the verification path
 * under test is the production one.
 */
export function agedFormToken(harness: TestApp, ageSeconds = 10): string {
  return issueFormToken(
    harness.env.FORM_TOKEN_SECRET,
    'booking',
    new Date(Date.now() - ageSeconds * 1000),
  ).token;
}

export type PublicSubmission = Record<string, unknown>;

/** A complete, valid submission. Fields are overridden per test. */
export function validSubmission(
  harness: TestApp,
  overrides: PublicSubmission = {},
): PublicSubmission {
  return {
    website: '',
    formToken: agedFormToken(harness),
    customerName: 'Anna Svensson',
    phone: '070-123 45 67',
    regNr: 'abc 12d',
    serviceTypeIds: [],
    ...overrides,
  };
}

/**
 * Posts to the public endpoint. No CSRF header: this is the one allow-listed
 * route in the system (§5.2), and a test that sent one would not notice if the
 * exemption were removed.
 */
export function submit(
  harness: TestApp,
  body: PublicSubmission,
  clientIp?: string,
): supertest.Test {
  const request = supertest(harness.app.server)
    .post('/api/public/booking-requests')
    .send(body);

  // Only meaningful when the harness was built with TRUST_PROXY enabled;
  // otherwise Fastify ignores the header and every caller shares one bucket.
  return clientIp === undefined
    ? request
    : request.set('x-forwarded-for', clientIp);
}

export type SeedRequestOptions = {
  readonly customerName?: string;
  readonly phone?: string;
  readonly email?: string | null;
  readonly regNr?: string | null;
  readonly status?: 'PENDING' | 'SPAM';
};

/** A booking request already in the inbox, without going through the form. */
export async function seedBookingRequest(
  harness: TestApp,
  options: SeedRequestOptions = {},
): Promise<string> {
  const created = await harness.app.prisma.bookingRequest.create({
    data: {
      status: options.status ?? 'PENDING',
      customerName: options.customerName ?? 'Anna Svensson',
      phone: options.phone ?? '070-123 45 67',
      email: options.email === undefined ? null : options.email,
      regNr: options.regNr === undefined ? 'ABC12D' : options.regNr,
      serviceTypeIds: [],
    },
    select: { id: true },
  });
  return created.id;
}
