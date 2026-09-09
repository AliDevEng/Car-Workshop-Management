import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  createOdometerReadingInputSchema,
  createVehicleInputSchema,
  cursorQuerySchema,
  odometerReadingResponseSchema,
  odometerReadingSchema,
  paginatedResponseSchema,
  updateVehicleInputSchema,
  vehicleByRegNrParamsSchema,
  vehicleDetailSchema,
  vehicleIdParamsSchema,
  vehicleListQuerySchema,
  vehicleSchema,
} from 'shared';
import { currentUser } from '../../plugins/auth.js';
import { clientIpHash } from '../auth/service.js';
import { listVehicles } from './repository.js';
import {
  createVehicle,
  getVehicleByRegNr,
  getVehicleDetail,
  updateVehicle,
} from './service.js';
import {
  getOdometerReadings,
  recordManualOdometerReading,
} from './odometer.service.js';

/**
 * Vehicles and their odometer history (PROJECT_SPEC.md §4.2, §6.3, B3.2, B3.3).
 *
 * `authenticated` throughout — the vehicle register is not an `ADMIN`-only
 * surface (§5.3).
 */
const authenticated = { auth: 'authenticated' } as const;

const vehicleListResponseSchema = paginatedResponseSchema(vehicleSchema);
const odometerListResponseSchema = paginatedResponseSchema(
  odometerReadingSchema,
);

export function registerVehicleRoutes(app: FastifyInstance): void {
  const routes = app.withTypeProvider<ZodTypeProvider>();

  routes.get(
    '/api/vehicles',
    {
      config: authenticated,
      schema: {
        querystring: vehicleListQuerySchema,
        response: { 200: vehicleListResponseSchema },
      },
    },
    (request) =>
      listVehicles(app.prisma, {
        limit: request.query.limit,
        cursor: request.query.cursor,
        q: request.query.q,
        customerId: request.query.customerId,
      }),
  );

  // A distinct two-segment path, so it never collides with `/api/vehicles/:id`.
  routes.get(
    '/api/vehicles/by-regnr/:regnr',
    {
      config: authenticated,
      schema: {
        params: vehicleByRegNrParamsSchema,
        response: { 200: vehicleDetailSchema, 404: apiErrorSchema },
      },
    },
    (request) => getVehicleByRegNr(app.prisma, request.params.regnr),
  );

  routes.get(
    '/api/vehicles/:id',
    {
      config: authenticated,
      schema: {
        params: vehicleIdParamsSchema,
        response: { 200: vehicleDetailSchema, 404: apiErrorSchema },
      },
    },
    (request) => getVehicleDetail(app.prisma, request.params.id),
  );

  routes.post(
    '/api/vehicles',
    {
      config: authenticated,
      schema: {
        body: createVehicleInputSchema,
        response: {
          201: vehicleSchema,
          400: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const created = await createVehicle(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.body,
      );
      return reply.status(201).send(created);
    },
  );

  routes.patch(
    '/api/vehicles/:id',
    {
      config: authenticated,
      schema: {
        params: vehicleIdParamsSchema,
        body: updateVehicleInputSchema,
        response: {
          200: vehicleSchema,
          400: apiErrorSchema,
          404: apiErrorSchema,
          409: apiErrorSchema,
        },
      },
    },
    (request) =>
      updateVehicle(
        app.prisma,
        currentUser(request).id,
        clientIpHash(app, request),
        request.params.id,
        request.body,
      ),
  );

  // ---- Odometer history (B3.3) --------------------------------------------

  routes.get(
    '/api/vehicles/:id/odometer-readings',
    {
      config: authenticated,
      schema: {
        params: vehicleIdParamsSchema,
        querystring: cursorQuerySchema,
        response: {
          200: odometerListResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    (request) =>
      getOdometerReadings(app.prisma, request.params.id, {
        limit: request.query.limit,
        cursor: request.query.cursor,
      }),
  );

  routes.post(
    '/api/vehicles/:id/odometer-readings',
    {
      config: authenticated,
      schema: {
        params: vehicleIdParamsSchema,
        body: createOdometerReadingInputSchema,
        response: {
          201: odometerReadingResponseSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await recordManualOdometerReading(
        app.prisma,
        currentUser(request).id,
        request.params.id,
        request.body,
      );
      return reply.status(201).send(result);
    },
  );
}
