import {
  NotFoundError,
  SERVICE_RULE_PREVIEW_SAMPLE_LIMIT,
  type CreateServiceRuleInput,
  type ImportServiceRulesInput,
  type ServiceRule,
  type ServiceRuleImportResponse,
  type ServiceRuleListResponse,
  type ServiceRulePreviewInput,
  type ServiceRulePreviewResponse,
  type UpdateServiceRuleInput,
} from 'shared';
import { writeAuditLog } from '../../lib/audit.js';
import { fieldError } from '../../lib/field-error.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { Database } from '../../lib/prisma.js';
import { parseServiceRulesCsv } from './csv.js';
import {
  findServiceRuleRecord,
  listServiceRules,
  previewServiceRuleMatches,
  toServiceRuleDto,
  type ListServiceRulesOptions,
  type ServiceRuleRecord,
} from './repository.js';

/**
 * Service rules (PROJECT_SPEC.md §4.2, §7.3; B9.1, B9.7.3).
 *
 * `ADMIN`-only (route-level) and fully audited — the same split §5.3 draws for
 * article prices and checklist templates. Overlapping rules are allowed by
 * design (B9.1.3); `shared/service-rules.ts` is what picks a winner, not a
 * database constraint here.
 */

const RULE_NOT_FOUND = 'Serviceregeln kunde inte hittas.';

function auditSnapshot(record: ServiceRuleRecord): Record<string, unknown> {
  return {
    make: record.make,
    model: record.model,
    engineCode: record.engineCode,
    modelYearFrom: record.modelYearFrom,
    modelYearTo: record.modelYearTo,
    serviceType: record.serviceType,
    intervalKm: record.intervalKm,
    intervalMonths: record.intervalMonths,
    sourceNote: record.sourceNote,
    isActive: record.isActive,
  };
}

async function loadRule(
  tx: Prisma.TransactionClient,
  id: string,
): Promise<ServiceRuleRecord> {
  const record = await findServiceRuleRecord(tx, id);
  if (record === null) {
    throw new NotFoundError(RULE_NOT_FOUND);
  }
  return record;
}

export async function getServiceRule(
  db: Database,
  id: string,
): Promise<ServiceRule> {
  const record = await findServiceRuleRecord(db, id);
  if (record === null) {
    throw new NotFoundError(RULE_NOT_FOUND);
  }
  return toServiceRuleDto(record);
}

export function getServiceRules(
  db: Database,
  options: ListServiceRulesOptions,
): Promise<ServiceRuleListResponse> {
  return listServiceRules(db, options);
}

export async function createServiceRule(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: CreateServiceRuleInput,
): Promise<ServiceRule> {
  return db.$transaction(async (tx) => {
    const created = await tx.serviceRule.create({
      data: {
        make: input.make,
        model: input.model ?? null,
        engineCode: input.engineCode ?? null,
        modelYearFrom: input.modelYearFrom ?? null,
        modelYearTo: input.modelYearTo ?? null,
        serviceType: input.serviceType,
        intervalKm: input.intervalKm ?? null,
        intervalMonths: input.intervalMonths ?? null,
        note: input.note ?? null,
        sourceNote: input.sourceNote,
        createdByUserId: actorId,
      },
      select: { id: true },
    });

    const record = await loadRule(tx, created.id);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'service_rule.created',
      entityType: 'ServiceRule',
      entityId: created.id,
      after: auditSnapshot(record),
      ipHash,
    });

    return toServiceRuleDto(record);
  });
}

/**
 * `createServiceRuleInputSchema`'s cross-field refinements — at least one
 * interval, a sensible year range — apply here against the row *after* the
 * merge, because the partial `UpdateServiceRuleInput` schema only sees the
 * fields the caller actually sent and cannot check a value it was not given
 * (see the schema's own comment in `shared/src/schemas/service-rule.ts`).
 */
function assertMergedRuleIsValid(merged: {
  readonly intervalKm: number | null;
  readonly intervalMonths: number | null;
  readonly modelYearFrom: number | null;
  readonly modelYearTo: number | null;
}): void {
  if (merged.intervalKm === null && merged.intervalMonths === null) {
    throw fieldError(
      'intervalKm',
      'Ange ett intervall i kilometer, i månader, eller båda.',
    );
  }
  if (
    merged.modelYearFrom !== null &&
    merged.modelYearTo !== null &&
    merged.modelYearFrom > merged.modelYearTo
  ) {
    throw fieldError(
      'modelYearTo',
      'Årsmodellsintervallet börjar efter att det slutar.',
    );
  }
}

export async function updateServiceRule(
  db: Database,
  actorId: string,
  ipHash: string | null,
  id: string,
  input: UpdateServiceRuleInput,
): Promise<ServiceRule> {
  return db.$transaction(async (tx) => {
    const before = await loadRule(tx, id);

    // `??` would be wrong here: a caller sending `null` means "clear this
    // field", and `null ?? before.x` silently falls back to the old value
    // because `??` treats `null` and `undefined` as the same kind of absent.
    // Only `undefined` — the field not sent at all — should fall back.
    assertMergedRuleIsValid({
      intervalKm:
        input.intervalKm === undefined ? before.intervalKm : input.intervalKm,
      intervalMonths:
        input.intervalMonths === undefined
          ? before.intervalMonths
          : input.intervalMonths,
      modelYearFrom:
        input.modelYearFrom === undefined
          ? before.modelYearFrom
          : input.modelYearFrom,
      modelYearTo:
        input.modelYearTo === undefined
          ? before.modelYearTo
          : input.modelYearTo,
    });

    await tx.serviceRule.update({
      where: { id },
      data: {
        ...(input.make === undefined ? {} : { make: input.make }),
        ...(input.model === undefined ? {} : { model: input.model }),
        ...(input.engineCode === undefined
          ? {}
          : { engineCode: input.engineCode }),
        ...(input.modelYearFrom === undefined
          ? {}
          : { modelYearFrom: input.modelYearFrom }),
        ...(input.modelYearTo === undefined
          ? {}
          : { modelYearTo: input.modelYearTo }),
        ...(input.serviceType === undefined
          ? {}
          : { serviceType: input.serviceType }),
        ...(input.intervalKm === undefined
          ? {}
          : { intervalKm: input.intervalKm }),
        ...(input.intervalMonths === undefined
          ? {}
          : { intervalMonths: input.intervalMonths }),
        ...(input.note === undefined ? {} : { note: input.note }),
        ...(input.sourceNote === undefined
          ? {}
          : { sourceNote: input.sourceNote }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });

    const after = await loadRule(tx, id);

    await writeAuditLog(tx, {
      userId: actorId,
      action: 'service_rule.updated',
      entityType: 'ServiceRule',
      entityId: id,
      before: auditSnapshot(before),
      after: auditSnapshot(after),
      ipHash,
    });

    return toServiceRuleDto(after);
  });
}

/** F11.3.4 / B9.7.3 — a preview of which vehicles a rule's criteria would match. */
export function previewServiceRule(
  db: Database,
  input: ServiceRulePreviewInput,
): Promise<ServiceRulePreviewResponse> {
  return previewServiceRuleMatches(
    db,
    input,
    SERVICE_RULE_PREVIEW_SAMPLE_LIMIT,
  );
}

/**
 * Bulk CSV import, with a dry run (F11.3.5, B9.7.3).
 *
 * A dry run validates every row and writes nothing. A real import writes only
 * if every row is valid — the same all-or-nothing reasoning as any other
 * multi-row write in this system: a partial import would leave the admin
 * unable to tell, from the file they uploaded, which half of it is now in the
 * database.
 */
export async function importServiceRules(
  db: Database,
  actorId: string,
  ipHash: string | null,
  input: ImportServiceRulesInput,
): Promise<ServiceRuleImportResponse> {
  const rows = parseServiceRulesCsv(input.csv);
  const allValid = rows.every((row) => row.status === 'VALID');

  if (input.dryRun || !allValid) {
    return { dryRun: input.dryRun, rows, createdCount: 0 };
  }

  const created = await db.$transaction(async (tx) => {
    let count = 0;
    for (const row of rows) {
      // `allValid` guarantees `row.rule` is a complete, validated input —
      // `createServiceRuleInputSchema` sets every required field, so a `VALID`
      // row's echoed `rule` can only be missing fields that schema makes
      // optional, which `tx.serviceRule.create` already defaults correctly.
      if (row.rule === undefined) {
        continue;
      }
      const record = await tx.serviceRule.create({
        data: {
          make: row.rule.make ?? '',
          model: row.rule.model ?? null,
          engineCode: row.rule.engineCode ?? null,
          modelYearFrom: row.rule.modelYearFrom ?? null,
          modelYearTo: row.rule.modelYearTo ?? null,
          serviceType: row.rule.serviceType ?? 'OTHER',
          intervalKm: row.rule.intervalKm ?? null,
          intervalMonths: row.rule.intervalMonths ?? null,
          note: row.rule.note ?? null,
          sourceNote: row.rule.sourceNote ?? '',
          createdByUserId: actorId,
        },
        select: { id: true, make: true, serviceType: true },
      });
      count += 1;

      await writeAuditLog(tx, {
        userId: actorId,
        action: 'service_rule.imported',
        entityType: 'ServiceRule',
        entityId: record.id,
        after: {
          make: record.make,
          serviceType: record.serviceType,
          line: row.line,
        },
        ipHash,
      });
    }
    return count;
  });

  return { dryRun: false, rows, createdCount: created };
}
