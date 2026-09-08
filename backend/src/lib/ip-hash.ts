import { createHash } from 'node:crypto';

/**
 * A salted SHA-256 of a client address (PROJECT_SPEC.md §5.5).
 *
 * A raw IP is personal data, and this system stores it in three places — the
 * session row, the audit log and the public booking request. Hashing with a
 * secret salt keeps the value useful for "was this the same visitor?" while
 * making it useless to anyone who reads the table, because an unsalted hash of
 * an address is trivially reversed: there are only four billion of them.
 *
 * Rotating `IP_HASH_SALT` therefore resets rate-limit history by design.
 */
export function hashIp(ip: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex');
}
