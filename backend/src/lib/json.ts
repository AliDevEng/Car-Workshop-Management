/**
 * Turning an arbitrary value into something a `Json` column can hold.
 *
 * Two places store a snapshot of a value they were handed: the audit log
 * (§4.2), which additionally redacts secrets, and the idempotency ledger
 * (§8.1), which must store a response back **exactly** as it was sent or a
 * replay would answer differently from the original. Those are different
 * policies over one walk, so the walk lives here and each caller supplies its
 * own policy — the alternative is two copies that drift, and the copy that
 * drifts is the one nobody is reading.
 */

/**
 * What a Prisma `Json` column can actually hold. Declared rather than reached
 * for with a cast: the walk below narrows `unknown` to this as it goes, so the
 * result is assignable to `Prisma.InputJsonValue` on its own merits
 * (CLAUDE.md — a cast means the type is wrong).
 */
export type JsonValue =
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/**
 * Depth limit for the walk. A cycle is impossible in a plain snapshot, but
 * these functions accept `unknown` and a caller can hand them anything;
 * bounding the recursion is cheaper than trusting every future caller.
 */
export const MAX_JSON_DEPTH = 8;

export type JsonWalkOptions = {
  /** True for a key whose value must be replaced rather than stored. */
  readonly redactKey?: (key: string) => boolean;
  /** What a redacted value — or an over-deep branch — becomes. */
  readonly placeholder?: string;
};

const DEFAULT_PLACEHOLDER = '[redacted]';

/**
 * Converts a value to `JsonValue`, doing the job `JSON.stringify` would
 * otherwise do later but where it can still be typed: a `Decimal`, a `Date` or
 * a `bigint` from a Prisma model becomes its string form, and a value JSON
 * cannot represent becomes `null` rather than disappearing and shifting an
 * array's indices.
 */
export function toJsonValue(
  value: unknown,
  options: JsonWalkOptions = {},
  depth = 0,
): JsonValue {
  const placeholder = options.placeholder ?? DEFAULT_PLACEHOLDER;

  if (depth >= MAX_JSON_DEPTH) {
    return placeholder;
  }

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'number') {
    // NaN and Infinity are not JSON; `JSON.stringify` turns them into null.
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    const items: readonly unknown[] = value;
    return items.map((item) => toJsonValue(item, options, depth + 1));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value !== 'object') {
    // A function, a symbol, or `undefined` inside an array.
    return null;
  }

  const entries = Object.entries(value).flatMap<[string, JsonValue]>(
    ([key, item]) => {
      if (options.redactKey?.(key) === true) {
        return [[key, placeholder]];
      }
      // An absent property stays absent, matching JSON.stringify.
      return item === undefined
        ? []
        : [[key, toJsonValue(item, options, depth + 1)]];
    },
  );

  return Object.fromEntries(entries);
}
