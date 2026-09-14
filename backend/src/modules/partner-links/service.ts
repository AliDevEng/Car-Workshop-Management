import {
  NotFoundError,
  ValidationError,
  type CreatePartnerLinkInput,
  type PartnerLink,
  type UpdatePartnerLinkInput,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { Database } from '../../lib/prisma.js';
import {
  findAllPartnerLinkIds,
  findPartnerLinkRecord,
  listPartnerLinks,
  toPartnerLinkDto,
  PARTNER_LINK_SELECT,
  type ListPartnerLinksOptions,
  type PartnerLinkRecord,
} from './repository.js';

/**
 * Partner deep links (PROJECT_SPEC.md §4.2, §7.2; B10.6).
 *
 * `ADMIN`-only writes (route-level, see `routes.ts`) — the same "workshop
 * policy, not a mechanic's day-to-day action" class as service rules and
 * article prices (§5.3). Reads are `authenticated`: a mechanic renders these
 * as buttons on the vehicle and article pages and never edits them.
 */

const LINK_NOT_FOUND = 'Länken kunde inte hittas.';

function auditSnapshot(record: PartnerLinkRecord): Record<string, unknown> {
  return {
    name: record.name,
    urlTemplate: record.urlTemplate,
    placeholderType: record.placeholderType,
    iconKey: record.iconKey,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
  };
}

export function getPartnerLinks(
  db: Database,
  options: ListPartnerLinksOptions,
): Promise<PartnerLink[]> {
  return listPartnerLinks(db, options);
}

export async function getPartnerLink(
  db: Database,
  id: string,
): Promise<PartnerLink> {
  const record = await findPartnerLinkRecord(db, id);
  if (record === null) {
    throw new NotFoundError(LINK_NOT_FOUND);
  }
  return toPartnerLinkDto(record);
}

/**
 * A new link is placed after every existing one by default — the admin
 * reorders afterwards rather than guessing at a position up front.
 */
export async function createPartnerLink(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreatePartnerLinkInput,
): Promise<PartnerLink> {
  return db.$transaction(async (tx) => {
    const sortOrder = input.sortOrder ?? (await tx.partnerLink.count());

    const created = await tx.partnerLink.create({
      data: {
        name: input.name,
        urlTemplate: input.urlTemplate,
        placeholderType: input.placeholderType,
        iconKey: input.iconKey ?? null,
        sortOrder,
      },
      select: { id: true },
    });

    const record = await findPartnerLinkRecord(tx, created.id);
    if (record === null) {
      throw new NotFoundError(LINK_NOT_FOUND);
    }

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'partner_link.created',
      entityType: 'PartnerLink',
      entityId: created.id,
      after: auditSnapshot(record),
      ipHash,
    });

    return toPartnerLinkDto(record);
  });
}

export async function updatePartnerLink(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdatePartnerLinkInput,
): Promise<PartnerLink> {
  return db.$transaction(async (tx) => {
    const before = await findPartnerLinkRecord(tx, id);
    if (before === null) {
      throw new NotFoundError(LINK_NOT_FOUND);
    }

    const after = await tx.partnerLink.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.urlTemplate === undefined
          ? {}
          : { urlTemplate: input.urlTemplate }),
        ...(input.placeholderType === undefined
          ? {}
          : { placeholderType: input.placeholderType }),
        ...(input.iconKey === undefined ? {} : { iconKey: input.iconKey }),
        ...(input.sortOrder === undefined
          ? {}
          : { sortOrder: input.sortOrder }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
      select: PARTNER_LINK_SELECT,
    });

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'partner_link.updated',
      entityType: 'PartnerLink',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toPartnerLinkDto(after);
  });
}

const REORDER_MISMATCH =
  'Listan med länkar har ändrats. Ladda om sidan och försök igen.';

/**
 * Replaces every link's `sortOrder` with its position in `orderedIds`
 * (B10.6.2). The set is checked against the existing rows **exactly** —
 * neither a link short nor an unknown id is accepted — because silently
 * dropping a link a stale client did not know about would disable it without
 * anyone choosing to.
 */
export async function reorderPartnerLinks(
  db: Database,
  actorId: string,
  ipHash: string | null,
  orderedIds: readonly string[],
): Promise<PartnerLink[]> {
  return db.$transaction(async (tx) => {
    const existing = await findAllPartnerLinkIds(tx);
    const existingIds = new Set(existing.map((row) => row.id));
    const givenIds = new Set(orderedIds);

    if (
      orderedIds.length !== givenIds.size ||
      existingIds.size !== givenIds.size ||
      ![...existingIds].every((id) => givenIds.has(id))
    ) {
      throw new ValidationError(REORDER_MISMATCH, {
        details: [{ path: 'orderedIds', message: REORDER_MISMATCH }],
      });
    }

    // Sequential, not `Promise.all`: a Prisma interactive transaction holds
    // one reserved connection, and firing independent writes over it
    // concurrently races rather than parallelises (found and documented
    // three times already in B9's decision log — this is the fourth place
    // that rule applies).
    for (const [index, id] of orderedIds.entries()) {
      await tx.partnerLink.update({
        where: { id },
        data: { sortOrder: index },
      });
    }

    const after = await listPartnerLinks(tx, {});

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'partner_link.reordered',
      entityType: 'PartnerLink',
      entityId: 'all',
      after: { orderedIds },
      ipHash,
    });

    return after;
  });
}
