import { z } from 'zod';

/** `GET /api/health` — B0's Definition of Done contract. Liveness only. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptime: z.number(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

/**
 * `GET /api/health/ready` — readiness (PROJECT_SPEC.md §8.5). Separate from
 * liveness on purpose: a process that is alive but cannot reach the database
 * must stop receiving traffic without being restarted.
 *
 * The endpoint answers with `200` and this body, or with the §3.7 error
 * envelope and `503`. There is no `status: 'degraded'` variant — a caller that
 * has to parse the body to learn whether it may send traffic will eventually
 * forget to.
 */
export const healthReadyResponseSchema = z.object({
  status: z.literal('ok'),
  database: z.literal('up'),
});
export type HealthReadyResponse = z.infer<typeof healthReadyResponseSchema>;
