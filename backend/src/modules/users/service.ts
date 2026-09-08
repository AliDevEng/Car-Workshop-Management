import type { User as UserDto } from 'shared';
import { ConflictError, NotFoundError } from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { Database } from '../../lib/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { toUserDto, type UserRecord } from '../auth/repository.js';

/**
 * Staff account management (PROJECT_SPEC.md §4.3, §5.3; B2.6).
 *
 * `ADMIN`-only, and nothing is ever hard-deleted: an account is deactivated,
 * so the audit trail keeps its actor and a dismissed employee's history stays
 * attributable.
 */

const userFields = {
  id: true,
  email: true,
  name: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** What the audit log records about a user. Never the hash (B2.7.2). */
function auditSnapshot(user: UserRecord): Record<string, unknown> {
  return {
    email: user.email,
    name: user.name,
    role: user.role,
    isActive: user.isActive,
  };
}

export type ListUsersOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly isActive?: boolean | undefined;
};

/**
 * Cursor pagination on the default sort (§8.1). `createdAt DESC, id DESC`
 * would need a composite cursor; `id` alone is enough here because the ids are
 * UUIDv7 and therefore already ordered by creation time, so one column is both
 * unique and monotonic.
 */
export async function listUsers(
  db: Database,
  options: ListUsersOptions,
): Promise<{ data: UserDto[]; nextCursor: string | null }> {
  const rows = await db.user.findMany({
    where: options.isActive === undefined ? {} : { isActive: options.isActive },
    select: userFields,
    orderBy: { id: 'desc' },
    // One extra row answers "is there a next page?" without a second count.
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toUserDto), nextCursor };
}

export async function getUser(db: Database, id: string): Promise<UserDto> {
  const user = await db.user.findUnique({ where: { id }, select: userFields });
  if (user === null) {
    throw new NotFoundError('Användaren kunde inte hittas.');
  }
  return toUserDto(user);
}

export type CreateUserData = {
  readonly email: string;
  readonly name: string;
  readonly role: 'ADMIN' | 'MECHANIC';
  readonly passwordHash: string;
};

export async function createUser(
  db: Database,
  actorId: string,
  ipHash: string | null,
  data: CreateUserData,
): Promise<UserDto> {
  return db.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email: data.email,
        name: data.name,
        role: data.role,
        passwordHash: data.passwordHash,
      },
      select: userFields,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'user.created',
      entityType: 'User',
      entityId: created.id,
      after: auditSnapshot(created),
      ipHash,
    });

    return toUserDto(created);
  });
}

export type UpdateUserData = {
  readonly email?: string | undefined;
  readonly name?: string | undefined;
  readonly role?: 'ADMIN' | 'MECHANIC' | undefined;
};

export async function updateUser(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  data: UpdateUserData,
): Promise<UserDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id },
      select: userFields,
    });
    if (before === null) {
      throw new NotFoundError('Användaren kunde inte hittas.');
    }

    // Demoting the last admin locks the workshop out of its own settings just
    // as thoroughly as deactivating them does, so it is refused for the same
    // reason (B2.6.3).
    if (before.role === 'ADMIN' && data.role === 'MECHANIC') {
      await assertNotLastActiveAdmin(tx, id);
    }

    const after = await tx.user.update({
      where: { id },
      data: {
        ...(data.email === undefined ? {} : { email: data.email }),
        ...(data.name === undefined ? {} : { name: data.name }),
        ...(data.role === undefined ? {} : { role: data.role }),
      },
      select: userFields,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'user.updated',
      entityType: 'User',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toUserDto(after);
  });
}

/**
 * Deactivation, never deletion (§4.3), and every session for that user is
 * destroyed in the same transaction — the reason this system uses sessions at
 * all is that a dismissed admin loses access *now* (§5.1).
 */
export async function deactivateUser(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<UserDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id },
      select: userFields,
    });
    if (before === null) {
      throw new NotFoundError('Användaren kunde inte hittas.');
    }

    if (!before.isActive) {
      return toUserDto(before);
    }

    if (before.role === 'ADMIN') {
      await assertNotLastActiveAdmin(tx, id);
    }

    const after = await tx.user.update({
      where: { id },
      data: { isActive: false },
      select: userFields,
    });
    await tx.session.deleteMany({ where: { userId: id } });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'user.deactivated',
      entityType: 'User',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toUserDto(after);
  });
}

export async function reactivateUser(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
): Promise<UserDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.user.findUnique({
      where: { id },
      select: userFields,
    });
    if (before === null) {
      throw new NotFoundError('Användaren kunde inte hittas.');
    }

    const after = await tx.user.update({
      where: { id },
      data: { isActive: true },
      select: userFields,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'user.reactivated',
      entityType: 'User',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toUserDto(after);
  });
}

/**
 * Refuses the change that would leave no active administrator (B2.6.3).
 *
 * **The lock is the point, not the count.** Checking and then acting is a race
 * with exactly the shape CLAUDE.md's trap table warns about: two admins
 * deactivating each other at the same moment would each read "there is another
 * one" and each proceed, and the workshop would be locked out of its own
 * settings with no route left to fix it. Locking the active admin rows first
 * makes the second transaction wait, re-read, and correctly find itself alone.
 *
 * Raw SQL because Prisma has no `FOR UPDATE`. It carries no interpolation at
 * all, and it is the same explicit-row-lock pattern §8.2 requires of the stock
 * ledger.
 */
async function assertNotLastActiveAdmin(
  tx: Prisma.TransactionClient,
  excludingUserId: string,
): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "User" WHERE "role" = 'ADMIN'::"UserRole" AND "isActive" = true FOR UPDATE`;

  const remaining = await tx.user.count({
    where: { role: 'ADMIN', isActive: true, NOT: { id: excludingUserId } },
  });

  if (remaining === 0) {
    throw new ConflictError(
      'Det måste finnas minst en aktiv administratör. Utse en annan administratör först.',
    );
  }
}
