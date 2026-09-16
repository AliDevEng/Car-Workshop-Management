import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  odometerReadingResponseSchema,
  odometerReadingSchema,
  paginatedResponseSchema,
  vehicleDetailSchema,
  vehicleSchema,
  type CreateOdometerReadingInput,
  type CreateVehicleInput,
  type UpdateVehicleInput,
  type Vehicle,
  type VehicleDetail,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

const vehicleListResponseSchema = paginatedResponseSchema(vehicleSchema);
const odometerListResponseSchema = paginatedResponseSchema(
  odometerReadingSchema,
);

export interface VehicleListParams {
  readonly q?: string;
  readonly customerId?: string;
  readonly inspectionDueSoon?: boolean;
  readonly cursor?: string;
  readonly limit?: number;
}

export function vehiclesPath(params: VehicleListParams): string {
  const search = new URLSearchParams();
  if (params.q !== undefined && params.q !== '') {
    search.set('q', params.q);
  }
  if (params.customerId !== undefined) {
    search.set('customerId', params.customerId);
  }
  if (params.inspectionDueSoon !== undefined) {
    search.set('inspectionDueSoon', String(params.inspectionDueSoon));
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? '/vehicles' : `/vehicles?${query}`;
}

export function useVehicles(
  params: VehicleListParams,
  options?: { readonly enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.vehicles(params),
    queryFn: () => apiFetch(vehiclesPath(params), vehicleListResponseSchema),
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useVehicle(id: string | null) {
  return useQuery({
    queryKey: queryKeys.vehicle(id ?? ''),
    queryFn: () => apiFetch(`/vehicles/${id ?? ''}`, vehicleDetailSchema),
    enabled: id !== null,
  });
}

async function invalidateVehicleQueries(
  queryClient: QueryClient,
  id: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.vehiclesRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.vehicle(id) }),
  ]);
}

export function useCreateVehicle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateVehicleInput) =>
      apiFetch('/vehicles', vehicleSchema, { method: 'POST', body: input }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.vehiclesRoot(),
      });
    },
  });
}

export function useUpdateVehicle(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateVehicleInput) =>
      apiFetch(`/vehicles/${id}`, vehicleSchema, {
        method: 'PATCH',
        body: input,
      }),
    // No optimistic `setQueryData` merge here, unlike `useUpdateCustomer`:
    // the `PATCH` response is a plain `Vehicle`, which has no `customer`
    // relation, while the cached detail is a `VehicleDetail`, which does.
    // Spreading the response over the cached detail would leave `customer`
    // pointing at the *previous* owner after a reassignment — exactly the
    // wrong direction for `ReassignOwnerDialog` to be wrong in. Invalidating
    // costs one extra round trip and is correct every time.
    onSuccess: async () => {
      await invalidateVehicleQueries(queryClient, id);
    },
  });
}

export function odometerReadingsPath(
  vehicleId: string,
  cursor?: string,
): string {
  const search = new URLSearchParams();
  if (cursor !== undefined) {
    search.set('cursor', cursor);
  }
  const query = search.toString();
  return query === ''
    ? `/vehicles/${vehicleId}/odometer-readings`
    : `/vehicles/${vehicleId}/odometer-readings?${query}`;
}

export function useOdometerReadings(vehicleId: string | null) {
  return useQuery({
    queryKey: queryKeys.odometerReadings(vehicleId ?? ''),
    queryFn: () =>
      apiFetch(
        odometerReadingsPath(vehicleId ?? '', undefined),
        odometerListResponseSchema,
      ),
    enabled: vehicleId !== null,
  });
}

export function useRecordOdometerReading(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOdometerReadingInput) =>
      apiFetch(
        `/vehicles/${vehicleId}/odometer-readings`,
        odometerReadingResponseSchema,
        { method: 'POST', body: input },
      ),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: queryKeys.odometerReadings(vehicleId),
        }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.vehicle(vehicleId),
        }),
      ]);
    },
  });
}

export type { Vehicle, VehicleDetail };
