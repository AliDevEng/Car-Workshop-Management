import type {
  ServiceRule,
  ServiceRuleFacts,
  ServiceRulePreviewVehicle,
  ServiceType,
} from 'shared';
import type { Prisma } from '../../generated/prisma/client.js';
import { toIsoDateTime } from '../../lib/dto-dates.js';
import type { Database } from '../../lib/prisma.js';

/**
 * Data access for service rules (PROJECT_SPEC.md §4.2, §7.3; B9.1).
 *
 * Every function returns a plain DTO or a `shared/service-rules.ts` fact
 * object, never a Prisma model — the same boundary every other repository in
 * this backend keeps.
 */

const serviceRuleFields = {
  id: true,
  make: true,
  model: true,
  engineCode: true,
  modelYearFrom: true,
  modelYearTo: true,
  serviceType: true,
  intervalKm: true,
  intervalMonths: true,
  note: true,
  sourceNote: true,
  createdByUserId: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type ServiceRuleRecord = Prisma.ServiceRuleGetPayload<{
  select: typeof serviceRuleFields;
}>;

export const SERVICE_RULE_SELECT = serviceRuleFields;

export function toServiceRuleDto(record: ServiceRuleRecord): ServiceRule {
  return {
    id: record.id,
    make: record.make,
    model: record.model,
    engineCode: record.engineCode,
    modelYearFrom: record.modelYearFrom,
    modelYearTo: record.modelYearTo,
    serviceType: record.serviceType,
    intervalKm: record.intervalKm,
    intervalMonths: record.intervalMonths,
    note: record.note,
    sourceNote: record.sourceNote,
    createdByUserId: record.createdByUserId,
    isActive: record.isActive,
    createdAt: toIsoDateTime(record.createdAt),
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

/** The shape the pure matching engine in `shared/service-rules.ts` consumes. */
export function toServiceRuleFacts(
  record: ServiceRuleRecord,
): ServiceRuleFacts {
  return {
    id: record.id,
    make: record.make,
    model: record.model,
    engineCode: record.engineCode,
    modelYearFrom: record.modelYearFrom,
    modelYearTo: record.modelYearTo,
    serviceType: record.serviceType,
    intervalKm: record.intervalKm,
    intervalMonths: record.intervalMonths,
    sourceNote: record.sourceNote,
    updatedAt: toIsoDateTime(record.updatedAt),
  };
}

export function findServiceRuleRecord(
  db: Database | Prisma.TransactionClient,
  id: string,
): Promise<ServiceRuleRecord | null> {
  return db.serviceRule.findUnique({
    where: { id },
    select: serviceRuleFields,
  });
}

export type ListServiceRulesOptions = {
  readonly limit: number;
  readonly cursor?: string | undefined;
  readonly make?: string | undefined;
  readonly serviceType?: ServiceType | undefined;
};

/**
 * Cursor pagination on `id DESC` — a UUIDv7, unique and monotonic by creation
 * time. §7.3 expects "realistically a few dozen" rules in total, so this is
 * generous rather than load-bearing.
 */
export async function listServiceRules(
  db: Database,
  options: ListServiceRulesOptions,
): Promise<{ data: ServiceRule[]; nextCursor: string | null }> {
  const rows = await db.serviceRule.findMany({
    where: {
      ...(options.make === undefined
        ? {}
        : { make: { equals: options.make, mode: 'insensitive' } }),
      ...(options.serviceType === undefined
        ? {}
        : { serviceType: options.serviceType }),
    },
    select: serviceRuleFields,
    orderBy: { id: 'desc' },
    take: options.limit + 1,
    ...(options.cursor === undefined
      ? {}
      : { cursor: { id: options.cursor }, skip: 1 }),
  });

  const page = rows.slice(0, options.limit);
  const nextCursor =
    rows.length > options.limit ? (page.at(-1)?.id ?? null) : null;

  return { data: page.map(toServiceRuleDto), nextCursor };
}

/**
 * Every active rule, for the matching engine (B9.2.1). Loaded whole rather
 * than queried per vehicle: at the scale §7.3 describes, one table scan per
 * recomputation is cheaper and far simpler than pushing the specificity
 * ranking into SQL.
 */
export async function loadActiveServiceRuleFacts(
  db: Database | Prisma.TransactionClient,
): Promise<ServiceRuleFacts[]> {
  const rows = await db.serviceRule.findMany({
    where: { isActive: true },
    select: serviceRuleFields,
  });
  return rows.map(toServiceRuleFacts);
}

export type ServiceRulePreviewCriteria = {
  readonly make: string;
  readonly model?: string | undefined;
  readonly engineCode?: string | undefined;
  readonly modelYearFrom?: number | undefined;
  readonly modelYearTo?: number | undefined;
};

function previewWhere(
  criteria: ServiceRulePreviewCriteria,
): Prisma.VehicleWhereInput {
  const modelYear: Prisma.IntNullableFilter = {};
  if (criteria.modelYearFrom !== undefined) {
    modelYear.gte = criteria.modelYearFrom;
  }
  if (criteria.modelYearTo !== undefined) {
    modelYear.lte = criteria.modelYearTo;
  }

  return {
    make: { equals: criteria.make, mode: 'insensitive' },
    ...(criteria.model === undefined
      ? {}
      : { model: { equals: criteria.model, mode: 'insensitive' } }),
    ...(criteria.engineCode === undefined
      ? {}
      : { engineCode: { equals: criteria.engineCode, mode: 'insensitive' } }),
    ...(Object.keys(modelYear).length === 0 ? {} : { modelYear }),
  };
}

/** F11.3.4 / B9.7.3 — which vehicles in the register a rule-in-progress matches. */
export async function previewServiceRuleMatches(
  db: Database,
  criteria: ServiceRulePreviewCriteria,
  sampleLimit: number,
): Promise<{ matchCount: number; sample: ServiceRulePreviewVehicle[] }> {
  const where = previewWhere(criteria);

  const [matchCount, sample] = await Promise.all([
    db.vehicle.count({ where }),
    db.vehicle.findMany({
      where,
      select: {
        id: true,
        registrationNumberDisplay: true,
        make: true,
        model: true,
        modelYear: true,
      },
      orderBy: { registrationNumberDisplay: 'asc' },
      take: sampleLimit,
    }),
  ]);

  return { matchCount, sample };
}
