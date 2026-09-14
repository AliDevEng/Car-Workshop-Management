import { z } from 'zod';
import { cursorQuerySchema, paginatedResponseSchema } from './common.js';
import {
  idSchema,
  isoDateTimeSchema,
  optionalIdSchema,
  shortTextSchema,
} from './primitives.js';
import { userSummarySchema } from './user.js';

/**
 * The audit log — PROJECT_SPEC.md §4.2.
 *
 * Written for every mutation of money, stock, status, service rules and
 * personal data. **Append-only:** no update or delete route exists, and none
 * should be added. There is deliberately no create input schema here either —
 * entries are written by a transaction-aware helper inside the same
 * transaction as the change they describe, never by an HTTP route.
 */
export const auditLogEntrySchema = z.object({
  id: idSchema,
  /** Null for something a scheduled job did rather than a person (§8.4). */
  userId: optionalIdSchema,
  user: userSummarySchema.nullable(),
  /** `article.price_changed`, `work_order.completed`, … */
  action: shortTextSchema,
  entityType: shortTextSchema,
  entityId: idSchema,
  /**
   * The change, before and after. `unknown` because it describes whatever
   * entity was touched, and because passwords, password hashes and session
   * secrets are redacted out of it before it is written (B2.7.2) — a typed
   * shape here would imply a completeness the redaction deliberately breaks.
   */
  beforeJson: z.unknown(),
  afterJson: z.unknown(),
  /** Salted hash, never the address itself (§5.5). */
  ipHash: z.string().nullable(),
  at: isoDateTimeSchema,
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogQuerySchema = cursorQuerySchema.extend({
  entityType: shortTextSchema.optional(),
  entityId: idSchema.optional(),
  userId: idSchema.optional(),
  from: isoDateTimeSchema.optional(),
  to: isoDateTimeSchema.optional(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

/** `GET /api/audit-log` (`ADMIN`-only, B11.1.4) — newest first, cursor-paginated. */
export const auditLogListResponseSchema =
  paginatedResponseSchema(auditLogEntrySchema);
export type AuditLogListResponse = z.infer<typeof auditLogListResponseSchema>;
