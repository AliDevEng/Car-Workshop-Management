import type { PartnerLink } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';
import type { Database } from '../../lib/prisma.js';

/**
 * Data access for partner deep links (PROJECT_SPEC.md §4.2, §7.2; B10.6).
 */

const partnerLinkFields = {
  id: true,
  name: true,
  urlTemplate: true,
  placeholderType: true,
  iconKey: true,
  sortOrder: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PartnerLinkRecord = Prisma.PartnerLinkGetPayload<{
  select: typeof partnerLinkFields;
}>;

export const PARTNER_LINK_SELECT = partnerLinkFields;

export function toPartnerLinkDto(record: PartnerLinkRecord): PartnerLink {
  return {
    id: record.id,
    name: record.name,
    urlTemplate: record.urlTemplate,
    placeholderType: record.placeholderType,
    iconKey: record.iconKey,
    sortOrder: record.sortOrder,
    isActive: record.isActive,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function findPartnerLinkRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<PartnerLinkRecord | null> {
  return db.partnerLink.findUnique({
    where: { id },
    select: partnerLinkFields,
  });
}

export type ListPartnerLinksOptions = {
  readonly isActive?: boolean | undefined;
};

/**
 * Ordered by `sortOrder`, not paginated — B10.6.2's list is a handful of rows
 * an admin drags into order on one screen. `id` breaks ties deterministically
 * for two links created with the same `sortOrder` (a fresh row defaults to
 * `0`, same as every other, until reordered).
 */
export async function listPartnerLinks(
  db: Database | Prisma.TransactionClient,
  options: ListPartnerLinksOptions,
): Promise<PartnerLink[]> {
  const rows = await db.partnerLink.findMany({
    where: options.isActive === undefined ? {} : { isActive: options.isActive },
    select: partnerLinkFields,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toPartnerLinkDto);
}

export function findAllPartnerLinkIds(
  db: Database | Prisma.TransactionClient,
): Promise<{ id: string }[]> {
  return db.partnerLink.findMany({ select: { id: true } });
}
