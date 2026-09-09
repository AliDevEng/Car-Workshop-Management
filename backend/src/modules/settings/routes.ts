import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { publicWorkshopInfoSchema, settingsResponseSchema } from 'shared';
import { getPublicWorkshopInfo, getSettings } from '../../config/settings.js';

/**
 * Workshop settings, read only (PROJECT_SPEC.md §4.2, B3.5).
 *
 * `GET /api/public/workshop` is deliberately public and exposes only the
 * workshop's own details and opening hours — the lookup ceilings and the
 * default hourly rate stay behind a login. `GET /api/settings` returns the
 * full view for the admin panel. Writes are `ADMIN`-only and arrive in B9.7.
 */
export function registerSettingsRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/public/workshop',
    {
      config: { auth: 'public' },
      schema: { response: { 200: publicWorkshopInfoSchema } },
    },
    () => getPublicWorkshopInfo(app.prisma),
  );

  routes.get(
    '/api/settings',
    {
      config: { auth: 'authenticated' },
      schema: { response: { 200: settingsResponseSchema } },
    },
    () => getSettings(app.prisma),
  );
}
