import { z } from 'zod';
import { cursorQuerySchema, paginatedResponseSchema } from './common.js';
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
/**
 * The plain object, before the cross-field refinements below. Kept separate
 * and exported so a partial variant (the CSV import row echo) can be built
 * from it — Zod refuses `.partial()` on a schema that already carries a
 * `.refine()`.
 */
export const serviceRuleInputFieldsSchema = z.object({
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
});

export const createServiceRuleInputSchema = serviceRuleInputFieldsSchema
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

/**
 * Every field is editable, `serviceType` included — unlike
 * `ChecklistTemplate`, nothing here is referenced-and-traced from another
 * record; `ServiceRecommendation.ruleSnapshotJson` exists precisely so a rule
 * can be freely edited without rewriting advice already given (§7.3). Narrowing
 * fields are `.nullable()` as well as `.optional()` so a client can both leave
 * a field alone (omit it) and deliberately clear it (send `null`) — the same
 * distinction `UpdateServiceProtocolInput` draws for `nextServiceDueDate`.
 *
 * The cross-field rules `createServiceRuleInputSchema` enforces — at least one
 * interval, a sensible year range — apply here against the row *after* the
 * merge, in the service layer: a partial update schema cannot see the fields
 * it was not given.
 */
export const updateServiceRuleInputSchema = z.object({
  make: nameSchema.optional(),
  model: nameSchema.nullable().optional(),
  engineCode: shortTextSchema.nullable().optional(),
  modelYearFrom: z.number().int().min(1900).max(2100).nullable().optional(),
  modelYearTo: z.number().int().min(1900).max(2100).nullable().optional(),
  serviceType: serviceTypeSchema.optional(),
  intervalKm: z.number().int().min(1).nullable().optional(),
  intervalMonths: z.number().int().min(1).nullable().optional(),
  note: noteSchema.nullable().optional(),
  sourceNote: shortTextSchema.optional(),
  isActive: z.boolean().optional(),
});
export type UpdateServiceRuleInput = z.infer<
  typeof updateServiceRuleInputSchema
>;

export const serviceRuleListQuerySchema = cursorQuerySchema.extend({
  make: nameSchema.optional(),
  serviceType: serviceTypeSchema.optional(),
});
export type ServiceRuleListQuery = z.infer<typeof serviceRuleListQuerySchema>;

export const serviceRuleResponseSchema = z.object({ rule: serviceRuleSchema });
export type ServiceRuleResponse = z.infer<typeof serviceRuleResponseSchema>;

export const serviceRuleListResponseSchema =
  paginatedResponseSchema(serviceRuleSchema);
export type ServiceRuleListResponse = z.infer<
  typeof serviceRuleListResponseSchema
>;

export const serviceRuleIdParamsSchema = z.object({ id: idSchema });
export type ServiceRuleIdParams = z.infer<typeof serviceRuleIdParamsSchema>;

/**
 * `POST /api/service-rules/preview` (F11.3.4, B9.7.3) — "which vehicles in the
 * register would this rule match", so a typo in the model name is visible
 * immediately rather than discovered the first time advice fails to appear.
 * Deliberately just the matching fields: a preview is about *targeting*, not
 * about the interval or the service type.
 */
export const serviceRulePreviewInputSchema = z.object({
  make: nameSchema,
  model: nameSchema.optional(),
  engineCode: shortTextSchema.optional(),
  modelYearFrom: z.number().int().min(1900).max(2100).optional(),
  modelYearTo: z.number().int().min(1900).max(2100).optional(),
});
export type ServiceRulePreviewInput = z.infer<
  typeof serviceRulePreviewInputSchema
>;

/** Bounded so a catch-all rule ("Volvo", nothing else) cannot return the whole register. */
export const SERVICE_RULE_PREVIEW_SAMPLE_LIMIT = 20;

export const serviceRulePreviewVehicleSchema = z.object({
  id: idSchema,
  registrationNumberDisplay: z.string(),
  make: nameSchema,
  model: nameSchema,
  modelYear: z.number().int().nullable(),
});
export type ServiceRulePreviewVehicle = z.infer<
  typeof serviceRulePreviewVehicleSchema
>;

export const serviceRulePreviewResponseSchema = z.object({
  matchCount: z.number().int().min(0),
  sample: z.array(serviceRulePreviewVehicleSchema),
});
export type ServiceRulePreviewResponse = z.infer<
  typeof serviceRulePreviewResponseSchema
>;

// --- CSV bulk import (F11.3.5, B9.7.3) ---------------------------------------

/**
 * The CSV travels as text in the request body, not a multipart upload: the
 * admin panel already has the file in the browser to show the dry-run preview
 * and nothing in `PROJECT_SPEC.md` §2.2 names a multipart dependency, so
 * re-posting the text the browser already parsed avoids adding one.
 */
export const importServiceRulesInputSchema = z.object({
  csv: z.string().min(1),
  /** `true` validates every row and writes nothing (F11.3.5's dry run). */
  dryRun: z.boolean(),
});
export type ImportServiceRulesInput = z.infer<
  typeof importServiceRulesInputSchema
>;

export const SERVICE_RULE_IMPORT_ROW_STATUSES = ['VALID', 'INVALID'] as const;
export type ServiceRuleImportRowStatus =
  (typeof SERVICE_RULE_IMPORT_ROW_STATUSES)[number];

export const serviceRuleImportRowSchema = z.object({
  /** 1-based, counting the header, so it matches the row a human sees in Excel. */
  line: z.number().int().min(2),
  status: z.enum(SERVICE_RULE_IMPORT_ROW_STATUSES),
  errors: z.array(z.string()),
  /**
   * The rule as parsed from the row, echoed back so the UI can show it beside
   * any errors — a partial, because an invalid row cannot be guaranteed to
   * parse into a complete one.
   */
  rule: serviceRuleInputFieldsSchema.partial().optional(),
});
export type ServiceRuleImportRow = z.infer<typeof serviceRuleImportRowSchema>;

export const serviceRuleImportResponseSchema = z.object({
  dryRun: z.boolean(),
  rows: z.array(serviceRuleImportRowSchema),
  /** `0` for a dry run: nothing is written until `dryRun: false` (B9.7.4). */
  createdCount: z.number().int().min(0),
});
export type ServiceRuleImportResponse = z.infer<
  typeof serviceRuleImportResponseSchema
>;

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
  /**
   * Read out of `ruleSnapshotJson` by the repository, not a separate stored
   * column — `PROJECT_SPEC.md` §4.2's field list for this entity has no room
   * for one. B9.5.3 requires it in the response anyway: a liability control
   * shown next to the advice is not useful behind an `unknown` blob the UI
   * would have to parse itself.
   */
  sourceNote: shortTextSchema,
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

export const serviceRecommendationResponseSchema = z.object({
  recommendation: serviceRecommendationSchema,
});
export type ServiceRecommendationResponse = z.infer<
  typeof serviceRecommendationResponseSchema
>;

export const serviceRecommendationListResponseSchema = paginatedResponseSchema(
  serviceRecommendationSchema,
);
export type ServiceRecommendationListResponse = z.infer<
  typeof serviceRecommendationListResponseSchema
>;

export const serviceRecommendationListQuerySchema = cursorQuerySchema.extend({
  vehicleId: idSchema.optional(),
  status: recommendationStatusSchema.optional(),
  severity: recommendationSeveritySchema.optional(),
});
export type ServiceRecommendationListQuery = z.infer<
  typeof serviceRecommendationListQuerySchema
>;

export const serviceRecommendationIdParamsSchema = z.object({ id: idSchema });
export type ServiceRecommendationIdParams = z.infer<
  typeof serviceRecommendationIdParamsSchema
>;
