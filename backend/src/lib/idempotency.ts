import { createHash } from 'node:crypto';
import { ConflictError } from 'shared';
import type { z } from 'zod';
import type { Prisma } from '../generated/prisma/client.js';
import { toJsonValue, type JsonValue } from './json.js';
import type { Database } from './prisma.js';
import { isPrismaKnownRequestError } from './prisma-errors.js';

/**
 * `Idempotency-Key` (PROJECT_SPEC.md §4.2, §8.1; B6.6.2, B6.6.3).
 *
 * §8.1: "Mutations that create money- or stock-affecting records accept an
 * `Idempotency-Key` header; a replay within 24 hours returns the original
 * result. Double-tapping *Slutför* on a laggy tablet must not deduct stock
 * twice."
 *
 * **The key row is written inside the same transaction as the effect**, which
 * is the whole design and the reason `run` is handed a `TransactionClient`
 * rather than opening one of its own. Written afterwards, a crash in the
 * millisecond between the two leaves the stock deducted and no record that it
 * happened — and the retry, which the tablet will certainly send, deducts it
 * again. That is the exact failure the mechanism exists to prevent, and it is
 * indistinguishable afterwards from a genuine second job.
 */

/**
 * A stable JSON form: object keys sorted, arrays left alone, `undefined`
 * dropped. Two structurally equal requests must hash equally, and
 * `JSON.stringify` preserves insertion order — so a body whose fields happened
 * to arrive in a different order would otherwise look like a different request
 * and turn an honest retry into a `409`.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item) => canonicalise(item));
  }

  if (typeof value !== 'object' || value === null || value instanceof Date) {
    return value;
  }

  const entries = Object.entries(value)
    .flatMap<[string, unknown]>(([key, item]) =>
      item === undefined ? [] : [[key, canonicalise(item)]],
    )
    .sort(([a], [b]) => a.localeCompare(b));

  return Object.fromEntries(entries);
}

/**
 * What the key stands for. The endpoint is part of it: the same key used on
 * two different routes describes two different effects, and replaying one as
 * the other would be worse than refusing.
 */
export function hashIdempotentRequest(
  endpoint: string,
  request: unknown,
): string {
  return createHash('sha256')
    .update(JSON.stringify({ endpoint, request: canonicalise(request) }))
    .digest('hex');
}

/**
 * The `409` for a key that has already been used for something else.
 *
 * Deliberately not "success": §4.2 is explicit that a matching key with a
 * different request hash "means a bug rather than a retry". Answering with the
 * first request's result would hide that bug behind a response that looks
 * right, and the caller would never learn its second effect never happened.
 */
const KEY_REUSED =
  'Idempotency-Key har redan använts för en annan begäran. Använd en ny ' +
  'nyckel.';

/** A concurrent duplicate that has not committed anything to replay yet. */
const KEY_IN_FLIGHT =
  'Samma begäran behandlas redan. Vänta ett ögonblick och försök igen.';

export type IdempotentMutation<T> = {
  /** The `Idempotency-Key` header, if the caller sent one. Optional (§8.1). */
  readonly key: string | undefined;
  /** Who is replaying. A key belongs to one caller and is checked against it. */
  readonly userId: string;
  /** `POST /api/work-orders/:id/status`, with the id resolved. */
  readonly endpoint: string;
  /** Everything that identifies the request. Hashed; never stored raw. */
  readonly request: unknown;
  /** Stored beside the response, so a replay answers with the same status. */
  readonly statusCode: number;
  /**
   * Parses a stored response back into `T`. A schema rather than a cast: the
   * row was written by an earlier deployment and its shape is a claim until
   * something checks it (CLAUDE.md — data crossing a boundary enters as
   * `unknown`).
   */
  readonly responseSchema: z.ZodType<T>;
};

type StoredResponse = {
  readonly userId: string;
  readonly requestHash: string;
  readonly responseJson: unknown;
};

/**
 * Replays a stored response, or refuses.
 *
 * The `userId` check is not decoration. §4.2 makes `key` globally unique, so
 * without it a caller who guessed — or was told — another caller's key would
 * be handed that caller's response body.
 */
function replay<T>(
  descriptor: IdempotentMutation<T>,
  requestHash: string,
  stored: StoredResponse,
): T {
  if (stored.userId !== descriptor.userId) {
    throw new ConflictError(KEY_REUSED);
  }
  if (stored.requestHash !== requestHash) {
    throw new ConflictError(KEY_REUSED);
  }
  return descriptor.responseSchema.parse(stored.responseJson);
}

/**
 * The response, as the `Json` column can hold it.
 *
 * Narrowed rather than cast: `responseJson` is typed `InputJsonValue`, which
 * excludes a bare `null` — Prisma reads that as "leave the field alone" and
 * needs `Prisma.JsonNull` for a real JSON null. An endpoint answering with
 * anything but an object is a programming error here, and one worth failing on
 * rather than storing something a replay could not reproduce.
 */
function toStorableResponse(value: unknown): Record<string, JsonValue> {
  const json = toJsonValue(value);
  if (json === null || typeof json !== 'object' || Array.isArray(json)) {
    throw new TypeError(
      'An idempotent response must be a JSON object, so it can be replayed',
    );
  }
  return json;
}

function findStoredResponse(
  db: Database,
  key: string,
): Promise<StoredResponse | null> {
  return db.idempotencyKey.findUnique({
    where: { key },
    select: { userId: true, requestHash: true, responseJson: true },
  });
}

/**
 * Runs `mutate` in one transaction, at most once per `Idempotency-Key`.
 *
 * Without a key this is a plain `$transaction` — §8.1 makes the header
 * optional, and a caller that does not send one has not asked for replay
 * protection and must not be given a silent, half-working version of it.
 */
export async function runIdempotent<T>(
  db: Database,
  descriptor: IdempotentMutation<T>,
  mutate: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const { key } = descriptor;
  if (key === undefined) {
    return db.$transaction((tx) => mutate(tx));
  }

  const requestHash = hashIdempotentRequest(
    descriptor.endpoint,
    descriptor.request,
  );

  const existing = await findStoredResponse(db, key);
  if (existing !== null) {
    return replay(descriptor, requestHash, existing);
  }

  try {
    return await db.$transaction(async (tx) => {
      // **The key is claimed before the effect runs**, and the order matters.
      // The insert takes the primary key's index lock, so a second request
      // carrying the same key *waits here* instead of racing the effect. Doing
      // it the other way round — mutate, then insert — was tried and is
      // subtly wrong: two concurrent completions both do the work, and the
      // loser fails on the optimistic-lock check rather than on the key, so
      // the caller is told "someone else changed this" about their own retry.
      //
      // It is still one transaction, which is what B6.6.3 requires: a
      // mutation that throws takes the claim down with it, leaving the retry
      // free to do the work for real.
      await tx.idempotencyKey.create({
        data: {
          key,
          userId: descriptor.userId,
          endpoint: descriptor.endpoint,
          requestHash,
          responseJson: {},
          statusCode: descriptor.statusCode,
        },
      });

      const result = await mutate(tx);

      await tx.idempotencyKey.update({
        where: { key },
        // No redaction: a replay has to answer with what was actually sent,
        // and this table holds a response the caller already received.
        data: { responseJson: toStorableResponse(result) },
      });

      return result;
    });
  } catch (error) {
    // The waiting duplicate, once the first request commits. Its own effect
    // rolled back with its claim, so the right answer is the first request's
    // stored one — which is the entire point of the mechanism, and the case a
    // check-then-insert would have missed.
    if (isPrismaKnownRequestError(error) && error.code === 'P2002') {
      const stored = await findStoredResponse(db, key);
      if (stored !== null) {
        return replay(descriptor, requestHash, stored);
      }
      // The winner rolled back after all, so there is nothing to replay and
      // nothing has happened. Retrying is safe, and saying so is honest.
      throw new ConflictError(KEY_IN_FLIGHT, { cause: error });
    }
    throw error;
  }
}
