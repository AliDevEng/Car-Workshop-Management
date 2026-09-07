import { z } from 'zod';

/** `GET /api/health` — B0's Definition of Done contract. */
export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  version: z.string(),
  uptime: z.number(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
