import { z } from 'zod';
import { cursorQuerySchema } from './common.js';
import {
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nameSchema,
  noteSchema,
  odometerKmSchema,
  optionalIdSchema,
  shortTextSchema,
  timestampFields,
} from './primitives.js';

/**
 * Service rules and the recommendations they produce — PROJECT_SPEC.md §4.2
 * and §7.3.
 *
 * The matching and due calculation live in `shared/service-rules.ts` as a pure
 * function (B9). This file is the contract the rules are entered and returned
 * through.
 */
export const SERVICE_TYPES = [
  'SERVICE_A',
  'SERVICE_B',
  'MAJOR_SERVICE',
  'TIMING_BELT',
  'BRAKE_FLUID',
  'AC_SERVICE',
  'OTHER',
] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

export const SERVICE_TYPE_LABELS: Readonly<Record<ServiceType, string>> = {
  SERVICE_A: 'Liten service',
  SERVICE_B: 'Stor service',
  MAJOR_SERVICE: 'Storservice',
  TIMING_BELT: 'Kamrem',
  BRAKE_FLUID: 'Bromsvätska',
  AC_SERVICE: 'AC-service',
  OTHER: 'Övrigt',
};

export const serviceTypeSchema = z.enum(SERVICE_TYPES);

export const RECOMMENDATION_SEVERITIES = [
  'OVERDUE',
  'DUE_SOON',
  'UPCOMING',
] as const;
export type RecommendationSeverity = (typeof RECOMMENDATION_SEVERITIES)[number];

export const RECOMMENDATION_SEVERITY_LABELS: Readonly<
  Record<RecommendationSeverity, string>
> = {
  OVERDUE: 'Förfallen',
  DUE_SOON: 'Snart dags',
  UPCOMING: 'Kommande',
};

export const recommendationSeveritySchema = z.enum(RECOMMENDATION_SEVERITIES);

export const RECOMMENDATION_STATUSES = [
  'SUGGESTED',
  'ACCEPTED',
  'DISMISSED',
] as const;
export type RecommendationStatus = (typeof RECOMMENDATION_STATUSES)[number];

export const RECOMMENDATION_STATUS_LABELS: Readonly<
  Record<RecommendationStatus, string>
> = {
  SUGGESTED: 'Föreslagen',
  ACCEPTED: 'Accepterad',
  DISMISSED: 'Avfärdad',
};

export const recommendationStatusSchema = z.enum(RECOMMENDATION_STATUSES);

/** The §7.3 severity thresholds, stated once so B9 and the UI agree. */
export const SEVERITY_THRESHOLDS = {
  dueSoonKm: 1_500,
  dueSoonDays: 60,
  upcomingKm: 5_000,
  upcomingDays: 180,
} as const;

/**
 * Matching is most-specific-wins: `make + model + engineCode + year range`
 * beats `make + model` beats `make`. Every narrowing field is therefore
 * optional, and a rule with only `make` is a legitimate catch-all.
 */
export const serviceRuleSchema = z.object({
  id: idSchema,
  make: nameSchema,
  model: nameSchema.nullable(),
  engineCode: shortTextSchema.nullable(),
  modelYearFrom: z.number().int().min(1900).max(2100).nullable(),
  modelYearTo: z.number().int().min(1900).max(2100).nullable(),
  serviceType: serviceTypeSchema,
  intervalKm: z.number().int().min(1).nullable(),
  intervalMonths: z.number().int().min(1).nullable(),
  note: noteSchema.nullable(),
  /**
   * Mandatory free text — "Volvo servicehäfte 2019", "verkstadens erfarenhet".
   * §7.3 makes this a liability control, not paperwork: if a timing belt is
   * recommended at 20 000 mil and fails at 18 000, the workshop can show
   * exactly where the number came from and who entered it. It is shown in the
   * UI next to the recommendation.
   */
  sourceNote: shortTextSchema,
  createdByUserId: idSchema,
  isActive: z.boolean(),
  ...timestampFields,
});
export type ServiceRule = z.infer<typeof serviceRuleSchema>;

/**
 * At least one of `intervalKm` and `intervalMonths` must be present — a rule
 * with neither can never come due, and would sit in the table looking correct.
 * Checked here rather than in a service because it is a property of the rule
 * itself, and both the admin form and the API should reject it identically.
 */
export const createServiceRuleInputSchema = z
  .object({
    make: nameSchema,
    model: nameSchema.optional(),
    engineCode: shortTextSchema.optional(),
    modelYearFrom: z.number().int().min(1900).max(2100).optional(),
    modelYearTo: z.number().int().min(1900).max(2100).optional(),
    serviceType: serviceTypeSchema,
    intervalKm: z.number().int().min(1).optional(),
    intervalMonths: z.number().int().min(1).optional(),
    note: noteSchema.optional(),
    sourceNote: shortTextSchema,
  })
  .refine(
    (rule) =>
      rule.intervalKm !== undefined || rule.intervalMonths !== undefined,
    {
      message: 'Ange ett intervall i kilometer, i månader, eller båda.',
      path: ['intervalKm'],
    },
  )
  .refine(
    (rule) =>
      rule.modelYearFrom === undefined ||
      rule.modelYearTo === undefined ||
      rule.modelYearFrom <= rule.modelYearTo,
    {
      message: 'Årsmodellsintervallet börjar efter att det slutar.',
      path: ['modelYearTo'],
    },
  );
export type CreateServiceRuleInput = z.infer<
  typeof createServiceRuleInputSchema
>;

export const serviceRuleListQuerySchema = cursorQuerySchema.extend({
  make: nameSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
});
export type ServiceRuleListQuery = z.infer<typeof serviceRuleListQuerySchema>;

/**
 * A recommendation is a **suggestion**. It never becomes a work order line on
 * its own: a mechanic accepts or dismisses each one and that decision is
 * recorded with their user id (§7.3).
 */
export const serviceRecommendationSchema = z.object({
  id: idSchema,
  vehicleId: idSchema,
  serviceRuleId: idSchema,
  /**
   * Freezes the rule as it was when the advice was given. Editing a rule
   * tomorrow does not rewrite yesterday's recommendation (§7.3). Typed
   * `unknown` for the same reason as `Document.payloadJson`: it is a snapshot
   * of a shape that is allowed to change.
   */
  ruleSnapshotJson: z.unknown(),
  serviceType: serviceTypeSchema,
  /** Whichever of km and date comes first wins (§7.3). */
  dueKm: odometerKmSchema.nullable(),
  dueDate: isoDateSchema.nullable(),
  severity: recommendationSeveritySchema,
  status: recommendationStatusSchema,
  decidedByUserId: optionalIdSchema,
  decidedAt: isoDateTimeSchema.nullable(),
  ...timestampFields,
});
export type ServiceRecommendation = z.infer<typeof serviceRecommendationSchema>;

export const decideRecommendationInputSchema = z.object({
  status: z.enum(['ACCEPTED', 'DISMISSED']),
});
export type DecideRecommendationInput = z.infer<
  typeof decideRecommendationInputSchema
>;
