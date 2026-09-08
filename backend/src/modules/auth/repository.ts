import type { User as UserSchema } from 'shared';
import type { Database } from '../../lib/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Data access for staff users and sessions.
 *
 * Every function here returns a plain object, never a Prisma model: §8.2 is
 * explicit that a model must not reach a route, and the `Date` fields have to
 * become ISO strings before the response schema will accept them.
 */

/** The user the request context carries. Never includes `passwordHash`. */
export type UserRecord = {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: 'ADMIN' | 'MECHANIC';
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserWithSecret = UserRecord & { readonly passwordHash: string };

export type SessionRecord = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly lastSeenAt: Date;
};

const userFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** Maps a row to the API's `User` shape — `Date` becomes an ISO string (§3.6). */
export function toUserDto(user: UserRecord): UserSchema {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function findUserByEmail(
  db: Database,
  email: string,
): Promise<UserWithSecret | null> {
  return db.user.findUnique({
    where: { email },
    select: { ...userFields, passwordHash: true },
  });
}

export function findUserById(
  db: Database,
  id: string,
): Promise<UserWithSecret | null> {
  return db.user.findUnique({
    where: { id },
    select: { ...userFields, passwordHash: true },
  });
}

/**
 * The session and its user in one query. Called on every authenticated
 * request, so it is deliberately a single round trip rather than two.
 */
export function findSessionWithUser(
  db: Database,
  id: string,
): Promise<{ session: SessionRecord; user: UserRecord } | null> {
  return db.session
    .findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        lastSeenAt: true,
        user: { select: userFields },
      },
    })
    .then((row) =>
      row === null
        ? null
        : {
            session: {
              id: row.id,
              userId: row.userId,
              expiresAt: row.expiresAt,
              lastSeenAt: row.lastSeenAt,
            },
            user: row.user,
          },
    );
}

export type CreateSessionInput = {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
};

export async function createSession(
  db: Database | Prisma.TransactionClient,
  input: CreateSessionInput,
): Promise<void> {
  await db.session.create({
    data: {
      id: input.id,
      userId: input.userId,
      expiresAt: input.expiresAt,
      lastSeenAt: new Date(),
      ipHash: input.ipHash,
      userAgent: input.userAgent,
    },
  });
}

export async function touchSession(
  db: Database,
  id: string,
  expiresAt: Date,
): Promise<void> {
  await db.session.update({
    where: { id },
    data: { lastSeenAt: new Date(), expiresAt },
  });
}

export async function deleteSession(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<void> {
  // `deleteMany`, not `delete`: logging out twice is not an error, and
  // `delete` would raise P2025 and answer 404 to a perfectly good logout.
  await db.session.deleteMany({ where: { id } });
}

/**
 * Ends every session for a user except, optionally, the one making the
 * request. Used by a password change (§5.1, B2.6.2) and by deactivation — a
 * dismissed admin must lose access *now*, which is the whole reason this
 * system uses sessions rather than JWT.
 */
export async function deleteOtherSessionsForUser(
  db: Database | Prisma.TransactionClient,
  userId: string,
  keepSessionId?: string,
): Promise<number> {
  const result = await db.session.deleteMany({
    where: {
      userId,
      ...(keepSessionId === undefined ? {} : { NOT: { id: keepSessionId } }),
    },
  });
  return result.count;
}
