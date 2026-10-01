import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  VehicleDataHttpError,
  createHttpJsonClient,
  type HttpJsonClient,
} from './http-client.js';

/**
 * B10.5.1 and B10.5.3 — the paid provider's HTTP transport.
 *
 * Driven against a real local server rather than a fake `fetch`, so the
 * timeout, the redirect refusal and the body handling are the runtime's own
 * behaviour, not a description of it.
 */

type Handler = (request: IncomingMessage, response: ServerResponse) => void;

const SECRET_KEY = 'sk-live-0123456789abcdef';

let server: Server;
let baseUrl: string;
let handlers: Handler[];
let received: IncomingMessage[];
let sleeps: number[];

function reply(
  status: number,
  body: string,
  headers: Record<string, string> = {},
): Handler {
  return (_request, response) => {
    response.writeHead(status, {
      'content-type': 'application/json',
      ...headers,
    });
    response.end(body);
  };
}

/** Never answers; the connection is closed when the server shuts down. */
const hang: Handler = () => undefined;

function client(timeoutMs = 2_000): HttpJsonClient {
  return createHttpJsonClient({
    timeoutMs,
    retryBaseDelayMs: 100,
    random: () => 0.25,
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
  });
}

function request(path = '/vehicles/ABC12D') {
  return { url: `${baseUrl}${path}`, headers: { 'x-api-key': SECRET_KEY } };
}

beforeAll(async () => {
  server = createServer((incoming, response) => {
    received.push(incoming);
    const handler = handlers.shift();
    if (handler === undefined) {
      response.writeHead(599);
      response.end();
      return;
    }
    handler(incoming, response);
  });
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve);
  });
  const address: AddressInfo | string | null = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('test server has no TCP address');
  }
  baseUrl = `http://127.0.0.1:${String(address.port)}`;
});

afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve) => {
    server.close(() => {
      resolve();
    });
  });
});

beforeEach(() => {
  handlers = [];
  received = [];
  sleeps = [];
});

describe('createHttpJsonClient (B10.5.1)', () => {
  it('returns the parsed body of a 2xx on the first attempt', async () => {
    handlers.push(reply(200, '{"make":"Volvo"}'));

    const response = await client().getJson(request());

    expect(response).toEqual({ status: 200, body: { make: 'Volvo' } });
    expect(received).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it("sends the caller's headers and asks for JSON", async () => {
    handlers.push(reply(200, '{}'));

    await client().getJson(request());

    expect(received[0]?.headers['x-api-key']).toBe(SECRET_KEY);
    expect(received[0]?.headers.accept).toBe('application/json');
    expect(received[0]?.method).toBe('GET');
  });

  it('retries a 5xx exactly once, after a jittered wait', async () => {
    handlers.push(reply(503, ''), reply(200, '{"ok":true}'));

    const response = await client().getJson(request());

    expect(response.body).toEqual({ ok: true });
    expect(received).toHaveLength(2);
    // 100 ms base × (0.5 + 0.25): the jitter is applied, not bypassed.
    expect(sleeps).toEqual([75]);
  });

  it('gives up after the second failure rather than retrying again', async () => {
    handlers.push(reply(502, ''), reply(500, ''), reply(200, '{}'));

    const failure = await client()
      .getJson(request())
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(VehicleDataHttpError);
    expect(failure).toMatchObject({ status: 500 });
    expect(received).toHaveLength(2);
  });

  it('never retries a 4xx — asking again only spends money on the same answer', async () => {
    handlers.push(reply(404, '{"error":"not found"}'), reply(200, '{}'));

    const response = await client().getJson(request());

    expect(response).toEqual({ status: 404, body: { error: 'not found' } });
    expect(received).toHaveLength(1);
    expect(sleeps).toEqual([]);
  });

  it('does not retry a 429 either', async () => {
    handlers.push(reply(429, ''), reply(200, '{}'));

    const response = await client().getJson(request());

    expect(response).toEqual({ status: 429, body: null });
    expect(received).toHaveLength(1);
  });

  it('tolerates a 4xx whose body is an HTML error page', async () => {
    handlers.push(reply(401, '<html>Unauthorized</html>'));

    const response = await client().getJson(request());

    expect(response).toEqual({ status: 401, body: null });
  });

  it('refuses a 2xx whose body is not JSON, without retrying', async () => {
    handlers.push(reply(200, '<html>maintenance</html>'), reply(200, '{}'));

    await expect(client().getJson(request())).rejects.toThrow(/not JSON/);
    expect(received).toHaveLength(1);
  });

  it('times out an attempt that never answers, and retries it once', async () => {
    handlers.push(hang, hang);

    await expect(client(150).getJson(request())).rejects.toThrow(/timed out/);
    expect(received).toHaveLength(2);
  });

  it('recovers when only the first attempt times out', async () => {
    handlers.push(hang, reply(200, '{"ok":true}'));

    const response = await client(150).getJson(request());

    expect(response.body).toEqual({ ok: true });
  });

  it('reports an unreachable host as a network error with its code', async () => {
    // Port 1 on loopback: nothing listens there, so the connection is refused.
    const failure = await client()
      .getJson({ url: 'http://127.0.0.1:1/vehicles/ABC12D', headers: {} })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(VehicleDataHttpError);
    expect(failure).toMatchObject({ status: null });
    expect(String(failure)).toMatch(/network error/);
    expect(sleeps).toHaveLength(1);
  });
});

describe('the credential never leaves by another route (B10.5.3)', () => {
  it('does not follow a redirect, so a custom key header cannot be forwarded', async () => {
    // The redirect points back at this same server, so following it would
    // show up as a second received request.
    handlers.push(
      reply(302, '', { location: `${baseUrl}/elsewhere` }),
      reply(200, '{}'),
    );

    await expect(client().getJson(request())).rejects.toThrow(
      /redirects are not followed/,
    );
    expect(received).toHaveLength(1);
  });

  it('names neither the URL nor any header in an error message', async () => {
    handlers.push(reply(500, ''), reply(503, ''));

    const failure = await client()
      .getJson(request(`/vehicles/ABC12D?key=${SECRET_KEY}`))
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(VehicleDataHttpError);
    const text =
      failure instanceof Error
        ? `${failure.message} ${failure.stack ?? ''}`
        : '';
    expect(text).not.toContain(SECRET_KEY);
    expect(text).not.toContain('127.0.0.1');
    expect(text).not.toContain('ABC12D');
  });
});
