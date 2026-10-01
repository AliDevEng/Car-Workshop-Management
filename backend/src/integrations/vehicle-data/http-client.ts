/**
 * The HTTP transport for a paid vehicle-data provider (PROJECT_SPEC.md §7.1,
 * B10.5.1, B10.5.3).
 *
 * Provider-agnostic on purpose: it knows how to ask once, carefully, and how
 * to give up, and nothing about any provider's URLs or field names. What a
 * given status *means* — a `404` as "no such registration number", say — is
 * the provider's decision, in `http-provider.ts`.
 *
 * The rules, and why each one is here rather than left to the caller:
 *
 * - **A timeout on every attempt.** A provider that accepts the connection and
 *   never answers would otherwise hold the public hero open indefinitely.
 * - **One retry, jittered, and only for a failure that may be transient** — a
 *   timeout, a dropped connection, a `5xx`. Each attempt may be billed, so
 *   there is never a second retry; the circuit breaker, not this loop, is what
 *   handles a provider that stays down.
 * - **Never a retry on a `4xx`.** A rejected key, a malformed plate or an
 *   exhausted quota is the same answer the second time, and asking again only
 *   spends money on it.
 * - **Redirects are not followed.** `fetch` strips `Authorization` when it
 *   follows a redirect to another origin, but not a custom header such as an
 *   API-key header, so following one could hand the workshop's credential to
 *   whichever host the redirect names (B10.5.3). A `3xx` is a failure.
 * - **Error messages never contain the request.** Not the URL and not a
 *   header: a message ends up in logs and, through `cause`, in Sentry.
 */

export type HttpJsonRequest = {
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
};

/**
 * A response the provider has to interpret: any `2xx` or `4xx`. `body` is the
 * parsed JSON, or `null` for an empty body — and, on a `4xx` only, for a body
 * that is not JSON, since an error page's content is not something a caller
 * can act on.
 */
export type HttpJsonResponse = {
  readonly status: number;
  readonly body: unknown;
};

export type HttpJsonClient = {
  readonly getJson: (request: HttpJsonRequest) => Promise<HttpJsonResponse>;
};

/**
 * Every way the transport can fail to produce an interpretable response. The
 * message is safe to log: it names what went wrong, never what was sent.
 */
export class VehicleDataHttpError extends Error {
  /** The HTTP status, or `null` when no response arrived at all. */
  readonly status: number | null;

  constructor(message: string, status: number | null) {
    super(message);
    this.name = 'VehicleDataHttpError';
    this.status = status;
  }
}

export type HttpJsonClientOptions = {
  /** Per attempt, not in total. */
  readonly timeoutMs?: number;
  /** The retry waits between 50 % and 150 % of this. */
  readonly retryBaseDelayMs?: number;
  /** Injectable for tests; the global `fetch` otherwise. */
  readonly fetch?: typeof fetch;
  readonly random?: () => number;
  readonly sleep?: (ms: number) => Promise<void>;
};

/**
 * Sized for a visitor watching a spinner on the public start page: two
 * attempts and the jittered wait between them stay under ten seconds, and the
 * circuit breaker opens long before a slow provider makes that the norm.
 */
const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_RETRY_BASE_DELAY_MS = 300;

type AttemptOutcome =
  | { readonly kind: 'response'; readonly response: HttpJsonResponse }
  | { readonly kind: 'retryable'; readonly error: VehicleDataHttpError };

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * A name for a failed `fetch` that says what happened without repeating the
 * request. `AbortSignal.timeout` rejects with a `TimeoutError`; a transport
 * failure is a `TypeError` whose `cause` carries a system code such as
 * `ECONNREFUSED`.
 */
function describeFetchFailure(error: unknown): string {
  if (error instanceof Error && error.name === 'TimeoutError') {
    return 'timed out';
  }
  const cause: unknown = error instanceof Error ? error.cause : undefined;
  if (
    typeof cause === 'object' &&
    cause !== null &&
    'code' in cause &&
    typeof cause.code === 'string'
  ) {
    return `network error (${cause.code})`;
  }
  return 'network error';
}

function parseJson(text: string): {
  readonly ok: boolean;
  readonly value: unknown;
} {
  if (text.trim() === '') {
    return { ok: true, value: null };
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, value: null };
  }
}

export function createHttpJsonClient(
  options: HttpJsonClientOptions = {},
): HttpJsonClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retryBaseDelayMs =
    options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const doFetch = options.fetch ?? fetch;
  const random = options.random ?? Math.random;
  const sleep = options.sleep ?? defaultSleep;

  async function attempt(request: HttpJsonRequest): Promise<AttemptOutcome> {
    let response: Response;
    let text: string;
    try {
      response = await doFetch(request.url, {
        method: 'GET',
        headers: { accept: 'application/json', ...request.headers },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });
      // Read inside the same `try`: the timeout covers a body that trickles
      // in as much as a response that never starts.
      text = await response.text();
    } catch (error) {
      return {
        kind: 'retryable',
        error: new VehicleDataHttpError(
          `Vehicle-data request ${describeFetchFailure(error)}`,
          null,
        ),
      };
    }

    const { status } = response;

    if (status >= 500) {
      return {
        kind: 'retryable',
        error: new VehicleDataHttpError(
          `Vehicle-data provider answered ${String(status)}`,
          status,
        ),
      };
    }

    if (status >= 300 && status < 400) {
      // Not retried: a redirect is the same redirect the second time, and
      // following it is exactly what this client refuses to do.
      throw new VehicleDataHttpError(
        `Vehicle-data provider answered ${String(status)}; redirects are not followed`,
        status,
      );
    }

    const parsed = parseJson(text);
    if (!parsed.ok && status < 300) {
      throw new VehicleDataHttpError(
        `Vehicle-data provider answered ${String(status)} with a body that is not JSON`,
        status,
      );
    }

    return { kind: 'response', response: { status, body: parsed.value } };
  }

  return {
    async getJson(request) {
      const first = await attempt(request);
      if (first.kind === 'response') {
        return first.response;
      }

      // Exactly one retry. The jitter keeps two workshop tablets that failed
      // together from retrying in lockstep against a provider that is
      // recovering.
      await sleep(retryBaseDelayMs * (0.5 + random()));

      const second = await attempt(request);
      if (second.kind === 'response') {
        return second.response;
      }
      throw second.error;
    },
  };
}
