import type { AuditLogEntry } from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';

/**
 * Reading the audit log (PROJECT_SPEC.md §4.2, B11.1.4).
 *
 * Read-only by design: the log is written exclusively by `writeAuditLog`
 * (`lib/audit.ts`), inside the same transaction as the change it describes,
 * and nothing here ever creates, updates or deletes a row.
 */

const auditLogFields = {
  id: true,
  userId: true,
  user: { select: { id: true, name: true, role: true } },
  action: true,
  entityType: true,
  entityId: true,
  beforeJson: true,
  afterJson: true,
  ipHash: true,
  at: true,
} as const;

export type AuditLogRecord = Prisma.AuditLogGetPayload<{
  select: typeof auditLogFields;
}>;

export const AUDIT_LOG_SELECT = auditLogFields;

export function toAuditLogEntryDto(record: AuditLogRecord): AuditLogEntry {
  return {
    id: record.id,
    userId: record.userId,
    user: record.user,
    action: record.action,
    entityType: record.entityType,
    entityId: record.entityId,
    beforeJson: record.beforeJson,
    afterJson: record.afterJson,
    ipHash: record.ipHash,
    at: toIsoDateTime(record.at),
  };
}

export type ListAuditLogOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly userId?: string | undefined;
  readonly from?: string | undefined;
  readonly to?: string | undefined;
};

/**
 * Newest first, cursor-paginated on `id DESC` — the id is a UUIDv7, already
 * unique and monotonic by insertion, the same reasoning `listCustomers` and
 * `listStockMovements` already use for an append-only or rarely-reordered
 * table (§8.1).
 */
export async function listAuditLog(
  db: Database,
  options: ListAuditLogOptions,
): Promise<{ data: AuditLogEntry[]; nextCursor: string | null }> {
  const at: Prisma.DateTimeFilter = {
    ...(options.from === undefined ? {} : { gte: new Date(options.from) }),
    ...(options.to === undefined ? {} : { lte: new Date(options.to) }),
  };

  const where: Prisma.AuditLogWhereInput = {
    ...(options.entityType === undefined
      ? {}
      : { entityType: options.entityType }),
    ...(options.entityId === undefined ? {} : { entityId: options.entityId }),
    ...(options.userId === undefined ? {} : { userId: options.userId }),
    ...(Object.keys(at).length === 0 ? {} : { at }),
  };

  const rows = await db.auditLog.findMany({
    where,
    select: auditLogFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toAuditLogEntryDto), nextCursor };
}
