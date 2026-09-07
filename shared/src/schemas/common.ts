import { z } from 'zod';

/**
 * One error shape for the whole API — PROJECT_SPEC.md §3.7. The frontend
 * renders `error.message` directly, which is why it is always Swedish.
 */
export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/**
 * An opaque resource identifier. Deliberately not constrained to a specific
 * format (uuid/cuid) here — the concrete generator is chosen when B2's
 * Prisma models are defined; every schema in `shared/` treats an id as an
 * opaque string.
 */
export const idSchema = z.string().min(1);

/**
 * Cursor pagination query params — PROJECT_SPEC.md §8.1. `cursor` is an
 * opaque, endpoint-defined base64 string; callers never construct one.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type CursorQuery = z.infer<typeof cursorQuerySchema>;

/**
 * Every list endpoint returns `{ data, nextCursor }` (§8.1). `nextCursor` is
 * `null` once the caller has reached the end of the list.
 */
export function paginatedResponseSchema<Item extends z.ZodTypeAny>(
  itemSchema: Item,
) {
  return z.object({
    data: z.array(itemSchema),
    nextCursor: z.string().nullable(),
  });
}
