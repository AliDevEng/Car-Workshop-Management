import { z } from 'zod';
import {
  documentNumberSchema,
  idSchema,
  isoDateSchema,
  isoDateTimeSchema,
  nameSchema,
  noteSchema,
  odometerKmSchema,
  shortTextSchema,
  timestampFields,
  versionSchema,
} from './primitives.js';
import { serviceTypeSchema } from './service-rule.js';

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
 * `version` here is a template revision counter, not an optimistic lock.
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

export const serviceProtocolSchema = z.object({
  id: idSchema,
  /** Unique: one protocol per work order (§4.2). */
  workOrderId: idSchema,
  number: documentNumberSchema,
  performedAt: isoDateTimeSchema,
  odometerKm: odometerKmSchema,
  performedByUserId: idSchema,
  /** The copied checklist, with its answers. */
  checklist: z.array(checklistAnswerSchema),
  /** The next recommended service, in both km and date (§6.7). */
  nextServiceDueKm: odometerKmSchema.nullable(),
  nextServiceDueDate: isoDateSchema.nullable(),
  documentId: idSchema,
  /** Once set, the protocol is immutable. */
  finalisedAt: isoDateTimeSchema.nullable(),
  ...timestampFields,
});
export type ServiceProtocol = z.infer<typeof serviceProtocolSchema>;

export const createServiceProtocolInputSchema = z.object({
  workOrderId: idSchema,
  checklistTemplateId: idSchema,
  performedAt: isoDateTimeSchema.optional(),
  odometerKm: odometerKmSchema,
  checklist: z.array(
    checklistAnswerSchema.extend({ note: noteSchema.optional() }),
  ),
  nextServiceDueKm: odometerKmSchema.optional(),
  nextServiceDueDate: isoDateSchema.optional(),
});
export type CreateServiceProtocolInput = z.infer<
  typeof createServiceProtocolInputSchema
>;
