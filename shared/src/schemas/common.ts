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

/**
 * Sort direction for the endpoints that declare a sortable column. §8.1 is
 * explicit that a cursor is only stable against a unique, monotonic sort key,
 * so an endpoint states which columns it will sort by and rejects the rest;
 * the frontend `DataTable` must not offer a sort the API has not declared.
 */
export const sortDirectionSchema = z.enum(['asc', 'desc']);
export type SortDirection = z.infer<typeof sortDirectionSchema>;

/**
 * The header carrying an idempotency key on money- and stock-affecting
 * mutations (§8.1). Lower-case because Node normalises incoming header names,
 * and comparing against a capitalised literal is a bug that only shows up
 * under a proxy.
 */
export const IDEMPOTENCY_KEY_HEADER = 'idempotency-key';

/**
 * A replay within 24 hours returns the original result; the same key with a
 * *different* request body is a `409`, because that means a bug rather than a
 * retry (§4.2).
 */
export const idempotencyKeySchema = z.string().min(8).max(200);

/**
 * A non-blocking advisory returned alongside a successful write — a stock
 * balance that went negative (§6.4), an odometer reading below the previous
 * highest (§3.5). Warnings never replace an error: if the request failed, it
 * failed with the §3.7 envelope.
 */
export const warningsSchema = z.array(z.string());
