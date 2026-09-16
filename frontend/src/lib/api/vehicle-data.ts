import { useMutation, useQueryClient } from '@tanstack/react-query';
import { vehicleDetailSchema, type VehicleDetail } from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

/**
 * F8.7.1 — the staff "refresh from the vehicle register" action
 * (`POST /vehicles/:id/vehicle-data/refresh`, B10.1–B10.4). `ADMIN`-only on
 * the backend, and deliberately throws on failure rather than quietly
 * serving stale data — unlike the public lookup, which degrades honestly
 * because an anonymous visitor has no other recourse.
 */
export function useRefreshVehicleData(vehicleId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch(
        `/vehicles/${vehicleId}/vehicle-data/refresh`,
        vehicleDetailSchema,
        { method: 'POST' },
      ),
    onSuccess: async (updated: VehicleDetail) => {
      queryClient.setQueryData(queryKeys.vehicle(vehicleId), updated);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.vehicle(vehicleId),
      });
    },
  });
}
