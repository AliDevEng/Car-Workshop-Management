import { describe, expect, it } from 'vitest';
import { hashIp } from './ip-hash.js';
import {
  getDummyPasswordHash,
  hashPassword,
  verifyPassword,
} from './password.js';

/** B2.1.2 and §5.5 — the two hashing primitives. */

describe('hashPassword / verifyPassword', () => {
  it('produces an argon2id hash and verifies it', async () => {
    const hash = await hashPassword('ett-riktigt-lösenord');

    // The encoded form names the algorithm and its parameters, so a silent
    // downgrade to argon2i or to weaker settings is visible here.
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
    expect(await verifyPassword(hash, 'ett-riktigt-lösenord')).toBe(true);
  });

  it('rejects the wrong password', async () => {
    const hash = await hashPassword('rätt');
    expect(await verifyPassword(hash, 'fel')).toBe(false);
  });

  it('salts, so the same password hashes differently every time', async () => {
    const first = await hashPassword('samma');
    const second = await hashPassword('samma');
    expect(first).not.toBe(second);
  });

  it('handles Swedish characters, which a byte-length bug would truncate', async () => {
    const hash = await hashPassword('lösenordet-är-åäö');
    expect(await verifyPassword(hash, 'lösenordet-är-åäö')).toBe(true);
    expect(await verifyPassword(hash, 'losenordet-ar-aao')).toBe(false);
  });

  it('returns false for a corrupt stored hash rather than throwing', async () => {
    // A crashing verify would answer 500, and a 500 on one account and a 401
    // on another tells an attacker which accounts exist.
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
    expect(await verifyPassword('', 'anything')).toBe(false);
  });
});

describe('getDummyPasswordHash', () => {
  it('is a real hash with the same parameters as a stored one', async () => {
    // If it were cheaper to verify than a real hash, the timing difference it
    // exists to remove would come straight back (§5.1, B2.3.3).
    const dummy = await getDummyPasswordHash();
    expect(dummy).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  });

  it('never verifies against anything a caller might send', async () => {
    const dummy = await getDummyPasswordHash();
    expect(await verifyPassword(dummy, '')).toBe(false);
    expect(await verifyPassword(dummy, 'password')).toBe(false);
  });

  it('is memoised, so the second login is not measurably faster', async () => {
    expect(await getDummyPasswordHash()).toBe(await getDummyPasswordHash());
  });
});

describe('hashIp', () => {
  it('produces a stable salted SHA-256', () => {
    const salt = 's'.repeat(32);
    expect(hashIp('127.0.0.1', salt)).toBe(hashIp('127.0.0.1', salt));
    expect(hashIp('127.0.0.1', salt)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never contains the address it hashes', () => {
    expect(hashIp('192.168.1.42', 's'.repeat(32))).not.toContain('192.168');
  });

  it('changes completely when the salt changes', () => {
    // Which is why rotating IP_HASH_SALT resets rate-limit history by design.
    expect(hashIp('127.0.0.1', 'a'.repeat(32))).not.toBe(
      hashIp('127.0.0.1', 'b'.repeat(32)),
    );
  });

  it('distinguishes different addresses under one salt', () => {
    const salt = 's'.repeat(32);
    expect(hashIp('127.0.0.1', salt)).not.toBe(hashIp('127.0.0.2', salt));
  });
});
