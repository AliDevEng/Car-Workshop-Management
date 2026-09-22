import { performance } from 'node:perf_hooks';
import { CSRF_COOKIE_NAME, CSRF_TOKEN_HEADER } from 'shared';
import type { PerfConfig } from './config.js';
import type { Sample } from './stats.js';

/**
 * The HTTP driver behind B13.3 and B13.4.
 *
 * Measurements go over the wire to a **running server**, not through
 * `app.inject` and not by calling repository functions directly. That is the
 * whole point: a budget in §8.1 terms covers routing, Zod validation, the
 * `fastify-type-provider-zod` serialiser and the JSON write — and the
 * serialiser in particular is where a list of twenty-five work orders with
 * their lines actually spends its time. A harness that skipped it would report
 * numbers no user can ever observe.
 *
 * No dependency: `fetch` and `performance` are both in the runtime (the
 * alternative was a load-testing package `PROJECT_SPEC.md` does not name —
 * decided with the human, 2026-09-21, recorded in `backend/README.md`).
 */

/**
 * Just enough cookie handling for one authenticated client: names to values,
 * replaced as the server reissues them.
 *
 * It has to be a jar rather than a fixed header, because the session cookie is
 * reissued on a sliding cadence (H1.9) and the CSRF cookie is reissued
 * whenever the binding changes (§5.2). Pinning the first `Set-Cookie` would
 * work for a few minutes and then start failing every write in a five-minute
 * run — which is exactly the kind of "the load test is broken" that gets
 * mistaken for "the server is broken".
 */
export class CookieJar {
  private readonly values = new Map<string, string>();

  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair] = header.split(';');
      const separator = pair?.indexOf('=') ?? -1;
      if (pair === undefined || separator <= 0) {
        continue;
      }
      this.values.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  }

  get(name: string): string | undefined {
    return this.values.get(name);
  }

  header(): string {
    return [...this.values]
      .map(([name, value]) => `${name}=${value}`)
      .join('; ');
  }
}

export type Client = {
  readonly jar: CookieJar;
  readonly baseUrl: string;
  /** The address this client presents itself as, when spreading is on. */
  readonly forwardedFor: string | undefined;
};

/**
 * The same session presenting a different client address.
 *
 * The jar is shared, not copied: this is one logged-in staff member, and the
 * session and CSRF cookies the server reissues mid-run must reach every
 * variant. Only the address changes — which is what gives each scenario its
 * own §5.4 rate-limit bucket without thirty-five separate logins, each of
 * which would also cost an argon2 verification the measurement is not about.
 */
export function withAddress(client: Client, forwardedFor: string): Client {
  return { jar: client.jar, baseUrl: client.baseUrl, forwardedFor };
}

export type RequestSpec = {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  readonly path: string;
  readonly body?: unknown;
  /** Sent on a stock- or money-affecting write, per §8.1. */
  readonly idempotencyKey?: string;
};

export type TimedResponse = {
  readonly sample: Sample;
  readonly body: unknown;
};

function headersFor(client: Client, spec: RequestSpec): Headers {
  const headers = new Headers({ accept: 'application/json' });
  const cookies = client.jar.header();

  if (cookies !== '') {
    headers.set('cookie', cookies);
  }
  if (spec.body !== undefined) {
    headers.set('content-type', 'application/json');
  }
  if (spec.method !== 'GET') {
    const token = client.jar.get(CSRF_COOKIE_NAME);
    if (token !== undefined) {
      // Double submit (§5.2): the value the cookie carries, echoed in the
      // header a cross-site caller cannot set.
      headers.set(CSRF_TOKEN_HEADER, token);
    }
  }
  if (spec.idempotencyKey !== undefined) {
    headers.set('idempotency-key', spec.idempotencyKey);
  }
  if (client.forwardedFor !== undefined) {
    headers.set('x-forwarded-for', client.forwardedFor);
  }

  return headers;
}

/**
 * One request, timed. A transport failure is a sample too, with status `0` —
 * dropping it would let a run that refused half its connections report a
 * flattering p95 over the half that succeeded.
 */
export async function request(
  client: Client,
  spec: RequestSpec,
): Promise<TimedResponse> {
  const started = performance.now();

  try {
    const response = await fetch(`${client.baseUrl}${spec.path}`, {
      method: spec.method,
      headers: headersFor(client, spec),
      ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
    });

    // Read the body before stopping the clock: a budget is about the response
    // a client can use, and "headers received" is not that.
    const text = await response.text();
    const durationMs = performance.now() - started;
    client.jar.absorb(response);

    let body: unknown = text;
    try {
      body = text === '' ? null : JSON.parse(text);
    } catch {
      // A non-JSON body (a PDF, an error page) is kept as text.
    }

    return {
      sample: { durationMs, status: response.status },
      body,
    };
  } catch (error) {
    return {
      sample: { durationMs: performance.now() - started, status: 0 },
      body: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Throws unless the response was a success, naming what came back. */
export function expectOk(spec: RequestSpec, result: TimedResponse): unknown {
  if (result.sample.status < 200 || result.sample.status >= 300) {
    throw new Error(
      `${spec.method} ${spec.path} answered ${String(result.sample.status)}: ` +
        JSON.stringify(result.body).slice(0, 400),
    );
  }
  return result.body;
}

/**
 * A logged-in client.
 *
 * `GET /api/auth/csrf` first, then the login: the anonymous binding cookie has
 * to exist before the token derived from it can be sent, and login is itself a
 * protected write (§5.2 exempts nothing but the public booking endpoint).
 */
export async function createClient(
  config: PerfConfig,
  forwardedFor?: string,
): Promise<Client> {
  const client: Client = {
    jar: new CookieJar(),
    baseUrl: config.PERF_BASE_URL,
    forwardedFor,
  };

  const csrf: RequestSpec = { method: 'GET', path: '/api/auth/csrf' };
  expectOk(csrf, await request(client, csrf));

  const login: RequestSpec = {
    method: 'POST',
    path: '/api/auth/login',
    body: { email: config.PERF_EMAIL, password: config.PERF_PASSWORD },
  };
  expectOk(login, await request(client, login));

  return client;
}
