import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  privacyPolicySchema,
  publicWorkshopInfoSchema,
  settingsResponseSchema,
  updateSettingsInputSchema,
} from 'shared';
import { PRIVACY_POLICY } from '../../config/privacy-policy.js';
import {
  getPublicWorkshopInfo,
  getSettings,
  updateSettings,
} from '../../config/settings.js';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';

/**
 * Workshop settings (PROJECT_SPEC.md §4.2, B3.5, B9.7.1).
 *
 * `GET /api/public/workshop` is deliberately public and exposes only the
 * workshop's own details and opening hours — the lookup ceilings and the
 * default hourly rate stay behind a login. `GET /api/settings` returns the
 * full view for the admin panel. `PATCH /api/settings` is `ADMIN`-only: §5.3
 * does not name workshop settings explicitly, but it is the same "workshop
 * policy, not a mechanic's day-to-day action" class as article prices and
 * service rules, and F11.1.4 asks for the same restriction.
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

  /** B11.2.4 — static content for `/integritetspolicy` (§6.1). */
  routes.get(
    '/api/public/privacy-policy',
    {
      config: { auth: 'public' },
      schema: { response: { 200: privacyPolicySchema } },
    },
    () => PRIVACY_POLICY,
  );

  routes.get(
    '/api/settings',
    {
      config: { auth: 'authenticated' },
      schema: { response: { 200: settingsResponseSchema } },
    },
    () => getSettings(app.prisma),
  );

  routes.patch(
    '/api/settings',
    {
      config: { auth: { role: 'ADMIN' } },
      schema: {
        body: updateSettingsInputSchema,
        response: { 200: settingsResponseSchema },
      },
    },
    (request) =>
      updateSettings(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      ),
  );
}
