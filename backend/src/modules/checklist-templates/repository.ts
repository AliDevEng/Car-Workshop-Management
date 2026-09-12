import { z } from 'zod';
import {
  checklistTemplateItemSchema,
  type ChecklistTemplate,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';

/**
 * Data access for checklist templates (PROJECT_SPEC.md §4.2, §6.7; B8.1).
 *
 * Every function returns a plain DTO, never a Prisma model. `itemsJson` is a
 * `Json` column and therefore reaches this module as `Prisma.JsonValue` — a
 * claim about its shape, not a guarantee. It is parsed through the same
 * `shared` schema the write path validates against (CLAUDE.md: data crossing a
 * boundary enters as `unknown`), so a row that was somehow written outside the
 * application fails loudly here rather than reaching the client as whatever
 * JSON happened to be stored.
 */

const checklistTemplateFields = {
  id: true,
  serviceType: true,
  name: true,
  itemsJson: true,
  isActive: true,
  version: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ChecklistTemplateRecord = Prisma.ChecklistTemplateGetPayload<{
  select: typeof checklistTemplateFields;
}>;

export const CHECKLIST_TEMPLATE_SELECT = checklistTemplateFields;

const checklistTemplateItemsSchema = z.array(checklistTemplateItemSchema);

export function toChecklistTemplateDto(
  record: ChecklistTemplateRecord,
): ChecklistTemplate {
  return {
    id: record.id,
    serviceType: record.serviceType,
    name: record.name,
    items: checklistTemplateItemsSchema.parse(record.itemsJson),
    isActive: record.isActive,
    version: record.version,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function findChecklistTemplateRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<ChecklistTemplateRecord | null> {
  return db.checklistTemplate.findUnique({
    where: { id },
    select: checklistTemplateFields,
  });
}

export type ListChecklistTemplatesOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly serviceType?: ChecklistTemplate['serviceType'] | undefined;
  readonly isActive?: boolean | undefined;
};

/**
 * Cursor pagination on `id DESC` — a UUIDv7, unique and monotonic by creation
 * time. There are only ever a handful of templates per service type, so this
 * is generous rather than load-bearing.
 */
export async function listChecklistTemplates(
  db: Database,
  options: ListChecklistTemplatesOptions,
): Promise<{ data: ChecklistTemplate[]; nextCursor: string | null }> {
  const rows = await db.checklistTemplate.findMany({
    where: {
      ...(options.serviceType === undefined
        ? {}
        : { serviceType: options.serviceType }),
      ...(options.isActive === undefined
        ? {}
        : { isActive: options.isActive }),
    },
    select: checklistTemplateFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toChecklistTemplateDto), nextCursor };
}
