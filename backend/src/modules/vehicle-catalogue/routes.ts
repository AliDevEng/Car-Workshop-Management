import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { vehicleMakeListResponseSchema } from 'shared';
import { listVehicleMakes } from './repository.js';

/**
 * The make/model catalogue (`GET /api/vehicle-makes`).
 *
 * `authenticated`, not `public`: the catalogue serves the admin panel's
 * booking and vehicle forms, and the public booking form deliberately collects
 * nothing about the car beyond a registration number (§5.5's data
 * minimisation). Exposing it publicly would widen that surface for no gain.
 *
 * There is no write route. The list is seeded reference data; adding a make
 * is a migration, which is the right weight for something the whole workshop
 * picks from.
 */
const authenticated = { auth: 'authenticated' } as const;

export function registerVehicleCatalogueRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/vehicle-makes',
    {
      config: authenticated,
      schema: { response: { 200: vehicleMakeListResponseSchema } },
    },
    async () => ({ data: await listVehicleMakes(app.prisma) }),
  );
}
