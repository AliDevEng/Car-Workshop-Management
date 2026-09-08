import { hash, verify, type Algorithm } from '@node-rs/argon2';

/**
 * argon2id password hashing (PROJECT_SPEC.md §5.1, B2.1.2).
 *
 * Parameters are stated rather than defaulted, because the default of any
 * binding is a moving target and a silent downgrade is invisible in review.
 * These are OWASP's argon2id baseline — 19 MiB of memory, two passes, one lane
 * — which resists GPU attack while staying comfortable on a small VPS running
 * a workshop's two logins a day.
 *
 * The cost is deliberate: roughly 40 ms per verify. That is also why the
 * login route is rate-limited rather than relying on the hash alone.
 */
/**
 * `Algorithm.Argon2id`, written as its value. The binding declares `Algorithm`
 * as an ambient `const enum`, which `verbatimModuleSyntax` cannot import as a
 * runtime value — the type annotation still checks that 2 is a member of it,
 * so this is a spelling change rather than a loosening.
 */
const ARGON2ID: Algorithm = 2;

const ARGON2_OPTIONS = {
  algorithm: ARGON2ID,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/**
 * Verifies a password. Returns `false` rather than throwing when the stored
 * hash is unparseable: a corrupt row must fail the login, not crash the route
 * with a 500 that tells the caller the account exists.
 */
export async function verifyPassword(
  storedHash: string,
  password: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, password, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}

let dummyHash: Promise<string> | undefined;

/**
 * A hash of a value nobody knows, used when the email is unknown (§5.1,
 * B2.3.3).
 *
 * Returning early on a missing user makes "no such account" and "wrong
 * password" distinguishable by response time, and that is precisely how an
 * attacker enumerates a workshop's staff list. Verifying against this instead
 * does the same work in the same time.
 *
 * Computed once and memoised on the promise, not the value: two concurrent
 * first logins would otherwise both pay the derivation cost, and the second
 * would answer measurably faster than the first.
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(
    'a-password-nobody-has-and-that-is-never-accepted',
  );
  return dummyHash;
}
