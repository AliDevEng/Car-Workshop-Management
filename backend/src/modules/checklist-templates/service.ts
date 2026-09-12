import {
  NotFoundError,
  type ChecklistTemplate,
  type ChecklistTemplateListResponse,
  type CreateChecklistTemplateInput,
  type UpdateChecklistTemplateInput,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import type { Database } from '../../lib/prisma.js';
import {
  findChecklistTemplateRecord,
  listChecklistTemplates,
  toChecklistTemplateDto,
  type ChecklistTemplateRecord,
  type ListChecklistTemplatesOptions,
} from './repository.js';

/**
 * Checklist templates (PROJECT_SPEC.md §4.2, §6.7; B8.1).
 *
 * Editable by `ADMIN` (route-level, see `routes.ts`) — the same split §5.3
 * draws for article prices and service rules. A template only ever supplies
 * the *questions*; the moment a protocol is created it copies them into its
 * own `checklistJson` (B8.1.3), so editing a template here never touches a
 * protocol that already exists.
 */

const TEMPLATE_NOT_FOUND = 'Checklistmallen kunde inte hittas.';

function auditSnapshot(record: ChecklistTemplateRecord): Record<string, unknown> {
  return {
    serviceType: record.serviceType,
    name: record.name,
    itemsJson: record.itemsJson,
    isActive: record.isActive,
    version: record.version,
  };
}

export async function getChecklistTemplate(
  db: Database,
  id: string,
): Promise<ChecklistTemplate> {
  const record = await findChecklistTemplateRecord(db, id);
  if (record === null) {
    throw new NotFoundError(TEMPLATE_NOT_FOUND);
  }
  return toChecklistTemplateDto(record);
}

export function getChecklistTemplates(
  db: Database,
  options: ListChecklistTemplatesOptions,
): Promise<ChecklistTemplateListResponse> {
  return listChecklistTemplates(db, options);
}

export async function createChecklistTemplate(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreateChecklistTemplateInput,
): Promise<ChecklistTemplate> {
  return db.$transaction(async (tx) => {
    const created = await tx.checklistTemplate.create({
      data: {
        serviceType: input.serviceType,
        name: input.name,
        itemsJson: input.items,
        version: 1,
      },
      select: { id: true },
    });

    const record = await findChecklistTemplateRecord(tx, created.id);
    if (record === null) {
      throw new NotFoundError(TEMPLATE_NOT_FOUND);
    }

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'checklist_template.created',
      entityType: 'ChecklistTemplate',
      entityId: created.id,
      after: auditSnapshot(record),
      ipHash,
    });

    return toChecklistTemplateDto(record);
  });
}

/**
 * Updates a template's name, items or active flag, bumping `version`.
 *
 * The bump is unconditional rather than a `where`-clause compare-and-swap
 * (contrast `work-orders/service.ts#updateWithVersion`): `version` here is an
 * informational revision counter, not an optimistic lock — see the Prisma
 * model comment for why a two-person, admin-only screen does not need one.
 */
export async function updateChecklistTemplate(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateChecklistTemplateInput,
): Promise<ChecklistTemplate> {
  return db.$transaction(async (tx) => {
    const before = await findChecklistTemplateRecord(tx, id);
    if (before === null) {
      throw new NotFoundError(TEMPLATE_NOT_FOUND);
    }

    await tx.checklistTemplate.update({
      where: { id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.items === undefined ? {} : { itemsJson: input.items }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
        version: { increment: 1 },
      },
    });

    const after = await findChecklistTemplateRecord(tx, id);
    if (after === null) {
      throw new NotFoundError(TEMPLATE_NOT_FOUND);
    }

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'checklist_template.updated',
      entityType: 'ChecklistTemplate',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toChecklistTemplateDto(after);
  });
}
