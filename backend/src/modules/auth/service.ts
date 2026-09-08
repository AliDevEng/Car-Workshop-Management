import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { SESSION_COOKIE_NAME, UnauthorizedError } from 'shared';
import { hashIp } from '../../lib/ip-hash.js';
import { getDummyPasswordHash, verifyPassword } from '../../lib/password.js';
import { writeAuditLog } from '../../lib/audit.js';
import {
  createSession,
  deleteOtherSessionsForUser,
  deleteSession,
  findSessionWithUser,
  findUserByEmail,
  touchSession,
  type CreateSessionInput,
  type SessionRecord,
  type UserRecord,
} from './repository.js';

/**
 * Session lifecycle (PROJECT_SPEC.md §5.1, B2.2).
 *
 * Sessions rather than JWT: a dismissed admin must lose access now, and
 * building a revocation list means building this table anyway with more
 * moving parts.
 */

export type AuthenticatedUser = UserRecord;
export type ActiveSession = SessionRecord;

/** 30 days, sliding on activity (§5.1). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * How stale `lastSeenAt` may get before the sliding expiry is written back.
 *
 * Without this, every authenticated request issues an UPDATE — a write per
 * page load, on the hot path, to move a timestamp by milliseconds. A minute of
 * granularity keeps the 30-day window honest and the write rate sane.
 */
const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

/** 256 bits, as §5.1 requires. `randomBytes` is the CSPRNG, not `Math.random`. */
export function generateSessionId(): string {
  return randomBytes(32).toString('hex');
}

function sessionCookieOptions(app: FastifyInstance): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  signed: true;
  maxAge: number;
} {
  return {
    httpOnly: true,
    // `secure` would make the cookie unusable over plain HTTP, which is what
    // development and the test harness speak. Production is HTTPS behind
    // Caddy (§2.3), and that is where it matters.
    secure: app.env.NODE_ENV === 'production',
    // Lax, not Strict: a link from an email into the admin panel should not
    // silently appear logged out. CSRF is handled explicitly in §5.2, so this
    // is a second layer rather than the only one.
    sameSite: 'lax',
    path: '/',
    signed: true,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function setSessionCookie(
  app: FastifyInstance,
  reply: FastifyReply,
  sessionId: string,
): void {
  reply.setCookie(SESSION_COOKIE_NAME, sessionId, sessionCookieOptions(app));
}

export function clearSessionCookie(
  app: FastifyInstance,
  reply: FastifyReply,
): void {
  reply.clearCookie(SESSION_COOKIE_NAME, {
    path: '/',
    httpOnly: true,
    secure: app.env.NODE_ENV === 'production',
    sameSite: 'lax',
  });
}

/**
 * Reads and validates the signed session cookie.
 *
 * A tampered signature is treated exactly like no cookie at all: the request
 * is anonymous. Answering 401 instead would tell an attacker their forgery was
 * detected, and would break a perfectly ordinary public page for someone
 * carrying a stale cookie from a rotated secret.
 */
export function readSessionCookie(request: FastifyRequest): string | undefined {
  const raw = request.cookies[SESSION_COOKIE_NAME];
  if (raw === undefined) {
    return undefined;
  }

  const unsigned = request.unsignCookie(raw);
  return unsigned.valid && unsigned.value !== null ? unsigned.value : undefined;
}

export function clientIpHash(
  app: FastifyInstance,
  request: FastifyRequest,
): string | null {
  return request.ip === '' ? null : hashIp(request.ip, app.env.IP_HASH_SALT);
}

/**
 * Resolves the session on an incoming request, or `null`.
 *
 * Four things end a session here, and all four are silent: no cookie, an
 * unknown id, an expired row, and a user who has been deactivated. The last
 * is the point of database-backed sessions — an admin removed at 09:00 is
 * locked out on their next request, not when a token happens to expire.
 */
export async function loadSession(
  app: FastifyInstance,
  request: FastifyRequest,
): Promise<{ session: ActiveSession; user: AuthenticatedUser } | null> {
  const sessionId = readSessionCookie(request);
  if (sessionId === undefined) {
    return null;
  }

  const found = await findSessionWithUser(app.prisma, sessionId);
  if (found === null) {
    return null;
  }

  const now = Date.now();

  if (found.session.expiresAt.getTime() <= now) {
    // Deleted on access (B2.2.4). The hourly job sweeps the rest; this keeps
    // an abandoned session from lingering merely because nobody swept yet.
    await deleteSession(app.prisma, found.session.id);
    return null;
  }

  if (!found.user.isActive) {
    await deleteSession(app.prisma, found.session.id);
    return null;
  }

  if (now - found.session.lastSeenAt.getTime() >= SESSION_TOUCH_INTERVAL_MS) {
    const expiresAt = new Date(now + SESSION_TTL_MS);
    await touchSession(app.prisma, found.session.id, expiresAt);
    return { session: { ...found.session, expiresAt }, user: found.user };
  }

  return found;
}

export type LoginInput = {
  readonly email: string;
  readonly password: string;
};

/**
 * Verifies credentials and creates a session.
 *
 * **The unknown-email path still runs a full argon2 verify** against a fixed
 * dummy hash (§5.1, B2.3.3). Returning early would make "no such account" and
 * "wrong password" distinguishable by response time, which is how an attacker
 * enumerates a two-person workshop's staff list. Same work, same answer.
 *
 * A deactivated user is treated as a wrong password for the same reason: a
 * distinct message would confirm the address belongs to a real employee.
 */
export async function authenticate(
  app: FastifyInstance,
  input: LoginInput,
  request: FastifyRequest,
): Promise<{ user: AuthenticatedUser; sessionId: string }> {
  const user = await findUserByEmail(app.prisma, input.email);
  const storedHash = user?.passwordHash ?? (await getDummyPasswordHash());

  const passwordMatches = await verifyPassword(storedHash, input.password);

  if (user === null || !passwordMatches || !user.isActive) {
    throw new UnauthorizedError('Fel e-postadress eller lösenord.');
  }

  const sessionId = await startSession(app, user.id, request);
  return { user, sessionId };
}

/**
 * The row a new session is made of. One definition, used by login and by the
 * password-change rotation — two would drift, and the one that drifted would
 * be the one that quietly stopped recording an IP.
 */
export function buildSessionRow(
  app: FastifyInstance,
  request: FastifyRequest,
  userId: string,
): CreateSessionInput {
  const userAgent = request.headers['user-agent'];

  return {
    id: generateSessionId(),
    userId,
    expiresAt: new Date(Date.now() + SESSION_TTL_MS),
    ipHash: clientIpHash(app, request),
    // Bounded: the header is caller-supplied and the column should not become
    // a place to store a kilobyte of anything.
    userAgent: userAgent === undefined ? null : userAgent.slice(0, 512),
  };
}

/** Creates a session row and returns its id. */
export async function startSession(
  app: FastifyInstance,
  userId: string,
  request: FastifyRequest,
): Promise<string> {
  const row = buildSessionRow(app, request, userId);
  await createSession(app.prisma, row);
  return row.id;
}

/**
 * Changes a password, rotates the session, and ends every other one — as a
 * single transaction (§8.2).
 *
 * The rotation is required by §5.2: a session fixed before a credential change
 * must not survive it. Destroying the others is the point of the feature — a
 * password is changed because someone believes the old one is known.
 */
export async function changePassword(
  app: FastifyInstance,
  request: FastifyRequest,
  input: {
    readonly userId: string;
    readonly currentSessionId: string;
    readonly passwordHash: string;
  },
): Promise<{ sessionId: string; revokedSessions: number }> {
  const row = buildSessionRow(app, request, input.userId);

  return app.prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { passwordHash: input.passwordHash },
    });

    // Counted while the current session still exists, so the number the UI
    // reports is "other browsers signed out" rather than being off by one.
    const revokedSessions = await deleteOtherSessionsForUser(
      tx,
      input.userId,
      input.currentSessionId,
    );
    await deleteSession(tx, input.currentSessionId);
    await createSession(tx, row);

    await writeAuditLog(tx, {
      userId: input.userId,
      action: 'user.password_changed',
      entityType: 'User',
      entityId: input.userId,
      // No before/after: the only field that changed is the one that must
      // never be recorded. The action and the actor are the audit value here.
      ipHash: row.ipHash,
    });

    return { sessionId: row.id, revokedSessions };
  });
}
