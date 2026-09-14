import { Prisma } from '../generated/prisma/client.js';
import { toJsonValue, type JsonValue } from './json.js';
import type { AnyDbClient } from './prisma.js';

/**
 * The audit foundation (PROJECT_SPEC.md §4.2, B2.7).
 *
 * Written for every mutation of money, stock, status, service rules and
 * personal data. It lands here in B2 rather than in B11 so that audited
 * mutations in B4 onward can be implemented and tested as they are built,
 * instead of being retrofitted once the writes already exist.
 */

/**
 * A Prisma client **or** a transaction client. Every audited mutation writes
 * its log inside the same transaction as the change it describes: a log
 * written afterwards is a log that a crash can lose, leaving a change nobody
 * can account for.
 */
export type AuditClient = AnyDbClient;

export type AuditEntry = {
  /** Who did it. Null for a scheduled job rather than a person (§8.4). */
  readonly userId: string | null;
  /** `user.created`, `article.price_changed`, `work_order.completed`, … */
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly before?: unknown;
  readonly after?: unknown;
  readonly ipHash?: string | null;
};

/**
 * Field names whose values never reach the log (B2.7.2).
 *
 * Matched case-insensitively on the whole key, not as a substring: `password`
 * and `passwordHash` are secrets, but a hypothetical `passwordChangedAt` is a
 * fact worth auditing, and a substring rule would silently swallow it. The set
 * is deliberately small and explicit — a clever heuristic here fails open,
 * which is the wrong direction for a redaction rule.
 */
const REDACTED_KEYS = new Set([
  'password',
  'passwordhash',
  'currentpassword',
  'newpassword',
  'sessionid',
  'sessionsecret',
  'csrftoken',
  'token',
  'secret',
]);

export const REDACTED_PLACEHOLDER = '[redacted]';

/** Re-exported so callers of `redact` need not know where the walk lives. */
export type { JsonValue };

/**
 * Replaces secret values with a placeholder, recursively, leaving the shape
 * intact — the log should still show *that* a password changed, and when.
 *
 * The walk itself is `lib/json.ts`; what belongs here is the policy, which is
 * the half that is specific to an audit log. The idempotency ledger uses the
 * same walk with **no** redaction, because it has to give back a response
 * byte-for-byte as it was first sent.
 */
export function redact(value: unknown): JsonValue {
  return toJsonValue(value, {
    redactKey: (key) => REDACTED_KEYS.has(key.toLowerCase()),
    placeholder: REDACTED_PLACEHOLDER,
  });
}

/**
 * `undefined` means "not recorded" and stays absent, so Prisma leaves the
 * column alone. A redacted `null` becomes `Prisma.JsonNull`, which is the only
 * way to write a JSON null — passing a bare `null` would be read as "do not
 * set this field" and the two states would become indistinguishable.
 */
function toJsonField(
  value: unknown,
): Prisma.InputJsonValue | typeof Prisma.JsonNull | undefined {
  if (value === undefined) {
    return undefined;
  }

  const redacted = redact(value);
  return redacted === null ? Prisma.JsonNull : redacted;
}

/**
 * Writes one audit row. Takes the client explicitly so the caller decides
 * whether it runs inside a transaction — and every audited mutation should
 * pass its `tx`.
 */
export async function writeAuditLog(
  client: AuditClient,
  entry: AuditEntry,
): Promise<void> {
  const beforeJson = toJsonField(entry.before);
  const afterJson = toJsonField(entry.after);

  await client.auditLog.create({
    data: {
      userId: entry.userId,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      // Spread rather than assigned: under `exactOptionalPropertyTypes` an
      // explicit `undefined` is not the same as an absent key, and Prisma
      // reads the two differently.
      ...(beforeJson === undefined ? {} : { beforeJson }),
      ...(afterJson === undefined ? {} : { afterJson }),
      ipHash: entry.ipHash ?? null,
    },
  });
}
