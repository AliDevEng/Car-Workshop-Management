import { z } from 'zod';
import { cursorQuerySchema, paginatedResponseSchema } from './common.js';
import { customerSummarySchema } from './customer.js';
import {
  booleanQuerySchema,
  documentNumberSchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nameSchema,
  noteSchema,
  odometerKmSchema,
  optionalIdSchema,
  shortTextSchema,
  timestampFields,
  versionSchema,
} from './primitives.js';
import { serviceTypeSchema } from './service-rule.js';
import { userSummarySchema } from './user.js';
import { vehicleSummarySchema } from './vehicle.js';

/**
 * The service protocol — PROJECT_SPEC.md §4.2, §6.7. The deliverable the
 * workshop hands over with the keys, and immutable once finalised: a
 * correction produces a new, clearly numbered document.
 */

export const CHECKLIST_RESULTS = ['OK', 'ATTENTION', 'NOT_APPLICABLE'] as const;
export type ChecklistResult = (typeof CHECKLIST_RESULTS)[number];

export const CHECKLIST_RESULT_LABELS: Readonly<
  Record<ChecklistResult, string>
> = {
  OK: 'Utan anmärkning',
  ATTENTION: 'Anmärkning',
  NOT_APPLICABLE: 'Ej tillämpligt',
};

export const checklistResultSchema = z.enum(CHECKLIST_RESULTS);

/**
 * One line of a checklist template — the question, before it is answered.
 * `key` is stable; `label` is Swedish and may be reworded between template
 * versions without invalidating old protocols, because each protocol keeps its
 * own copy (§6.7).
 */
export const checklistTemplateItemSchema = z.object({
  key: z.string().min(1).max(64),
  label: shortTextSchema,
});
export type ChecklistTemplateItem = z.infer<typeof checklistTemplateItemSchema>;

/** The same line with its answer, as stored in the protocol's `checklistJson`. */
export const checklistAnswerSchema = checklistTemplateItemSchema.extend({
  result: checklistResultSchema,
  note: noteSchema.nullable(),
});
export type ChecklistAnswer = z.infer<typeof checklistAnswerSchema>;

/**
 * Templates are **copied** into each protocol rather than referenced (§6.7),
 * so an old protocol keeps the checklist that existed when it was signed.
 * `version` here is a template revision counter, not an optimistic lock —
 * unlike `WorkOrder.version` (§6.5), nothing about an admin-only settings
 * screen is a concurrent multi-editor surface, so a compare-and-swap would
 * only add false conflicts.
 */
export const checklistTemplateSchema = z.object({
  id: idSchema,
  serviceType: serviceTypeSchema,
  name: nameSchema,
  items: z.array(checklistTemplateItemSchema),
  isActive: z.boolean(),
  version: versionSchema,
  ...timestampFields,
});
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;

export const createChecklistTemplateInputSchema = z.object({
  serviceType: serviceTypeSchema,
  name: nameSchema,
  items: z.array(checklistTemplateItemSchema).min(1),
});
export type CreateChecklistTemplateInput = z.infer<
  typeof createChecklistTemplateInputSchema
>;

/**
 * `serviceType` is deliberately absent: it is the template's category, and
 * changing it after protocols may already reference the row for traceability
 * would rewrite what those protocols point at. A new service type gets a new
 * template.
 */
export const updateChecklistTemplateInputSchema = z
  .object({
    name: nameSchema,
    items: z.array(checklistTemplateItemSchema).min(1),
    isActive: z.boolean(),
  })
  .partial();
export type UpdateChecklistTemplateInput = z.infer<
  typeof updateChecklistTemplateInputSchema
>;

export const checklistTemplateListQuerySchema = cursorQuerySchema.extend({
  serviceType: serviceTypeSchema.optional(),
  isActive: booleanQuerySchema.optional(),
});
export type ChecklistTemplateListQuery = z.infer<
  typeof checklistTemplateListQuerySchema
>;

export const checklistTemplateListResponseSchema =
  paginatedResponseSchema(checklistTemplateSchema);
export type ChecklistTemplateListResponse = z.infer<
  typeof checklistTemplateListResponseSchema
>;

export const checklistTemplateResponseSchema = z.object({
  template: checklistTemplateSchema,
});
export type ChecklistTemplateResponse = z.infer<
  typeof checklistTemplateResponseSchema
>;

export const checklistTemplateIdParamsSchema = z.object({ id: idSchema });
export type ChecklistTemplateIdParams = z.infer<
  typeof checklistTemplateIdParamsSchema
>;

// --- Service protocol ---------------------------------------------------------

/**
 * **`number` and `documentId` are nullable, correcting §4.2's literal field
 * list.** The specification names both as plain (non-optional) fields, but
 * §4.4 assigns a document number *on finalisation*, and B8.2/B8.4 split
 * creating a protocol record from finalising it — exactly the two-step shape
 * B7.3/B7.4 already gave `Quote`. A record that must carry a number before it
 * can exist would collapse those two steps back into one, which the
 * Definition of Done for B8.2 (create) and B8.4 (finalise) both assume are
 * separate.
 *
 * **`revision` and `supersedesProtocolId` are additions**, for the same reason
 * `Quote` has them: §6.7 requires "corrections produce a new, clearly numbered
 * document", which only works if more than one `ServiceProtocol` row can exist
 * per work order. See the schema comment on the Prisma model for the full
 * reconciliation (B8.5.3).
 */
export const serviceProtocolSchema = z.object({
  id: idSchema,
  /** The work order this protocol was written for. */
  workOrderId: idSchema,
  number: documentNumberSchema.nullable(),
  /** Which version of this work order's protocol this is, counting from 1. */
  revision: z.number().int().min(1),
  /** The finalised protocol this one corrects, if it is a correction. */
  supersedesProtocolId: optionalIdSchema,
  performedAt: isoDateTimeSchema,
  odometerKm: odometerKmSchema,
  performedByUserId: idSchema,
  /** The template this checklist was copied from. Traceability only. */
  checklistTemplateId: optionalIdSchema,
  /** The copied checklist, with its answers. */
  checklist: z.array(checklistAnswerSchema),
  /** The next recommended service, in both km and date (§6.7). */
  nextServiceDueKm: odometerKmSchema.nullable(),
  nextServiceDueDate: isoDateSchema.nullable(),
  /** §6.7's free-text notes. Not in §4.2's literal field list — see the
   * Prisma model comment. */
  notes: noteSchema.nullable(),
  documentId: optionalIdSchema,
  /** Once set, the protocol is immutable. */
  finalisedAt: isoDateTimeSchema.nullable(),
  ...timestampFields,
});
export type ServiceProtocol = z.infer<typeof serviceProtocolSchema>;

export const serviceProtocolDetailSchema = serviceProtocolSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema,
  workOrderNumber: documentNumberSchema.nullable(),
  performedBy: userSummarySchema,
});
export type ServiceProtocolDetail = z.infer<typeof serviceProtocolDetailSchema>;

export const serviceProtocolListItemSchema = serviceProtocolSchema.extend({
  customer: customerSummarySchema,
  vehicle: vehicleSummarySchema,
  performedBy: userSummarySchema,
});
export type ServiceProtocolListItem = z.infer<
  typeof serviceProtocolListItemSchema
>;

export const serviceProtocolListResponseSchema = paginatedResponseSchema(
  serviceProtocolListItemSchema,
);
export type ServiceProtocolListResponse = z.infer<
  typeof serviceProtocolListResponseSchema
>;

export const serviceProtocolResponseSchema = z.object({
  protocol: serviceProtocolDetailSchema,
});
export type ServiceProtocolResponse = z.infer<
  typeof serviceProtocolResponseSchema
>;

export const serviceProtocolIdParamsSchema = z.object({ id: idSchema });
export type ServiceProtocolIdParams = z.infer<
  typeof serviceProtocolIdParamsSchema
>;

export const serviceProtocolListQuerySchema = cursorQuerySchema.extend({
  workOrderId: idSchema.optional(),
  finalised: booleanQuerySchema.optional(),
});
export type ServiceProtocolListQuery = z.infer<
  typeof serviceProtocolListQuerySchema
>;

/**
 * The work order is the path parameter, not a body field — mirroring
 * `createQuoteInputSchema` — because what is being created is scoped to it.
 * The same shape is reused for `POST /api/service-protocols/:id/correct`
 * (B8.4.2), exactly as `createQuoteInputSchema` is reused by `reviseQuote`:
 * a correction is a fresh protocol, snapshotting the work order and the
 * checklist template again rather than editing the one it replaces.
 */
export const createServiceProtocolInputSchema = z.object({
  checklistTemplateId: idSchema,
  performedAt: isoDateTimeSchema.optional(),
  odometerKm: odometerKmSchema,
  checklist: z.array(
    checklistAnswerSchema.extend({ note: noteSchema.optional() }),
  ),
  nextServiceDueKm: odometerKmSchema.optional(),
  nextServiceDueDate: isoDateSchema.optional(),
  notes: noteSchema.optional(),
});
export type CreateServiceProtocolInput = z.infer<
  typeof createServiceProtocolInputSchema
>;

/**
 * Everything a protocol may still change before finalisation (B8.2, B8.5.1).
 * `checklistTemplateId` is absent: the checklist has already been copied, and
 * switching templates mid-edit would leave answers for questions the new
 * template does not ask.
 */
export const updateServiceProtocolInputSchema = z
  .object({
    performedAt: isoDateTimeSchema,
    odometerKm: odometerKmSchema,
    checklist: z.array(
      checklistAnswerSchema.extend({ note: noteSchema.optional() }),
    ),
    nextServiceDueKm: odometerKmSchema.nullable(),
    nextServiceDueDate: isoDateSchema.nullable(),
    notes: noteSchema.nullable(),
  })
  .partial();
export type UpdateServiceProtocolInput = z.infer<
  typeof updateServiceProtocolInputSchema
>;
