import { useQuery } from '@tanstack/react-query';
import { vehicleMakeListResponseSchema, type VehicleMake } from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

/**
 * The make/model catalogue behind the booking dialog's two dropdowns.
 *
 * Reference data that changes when a migration adds a row, so it is cached for
 * the whole session rather than refetched: `staleTime: Infinity` means opening
 * the dialog ten times during a morning costs one request, and a mechanic on a
 * phone in a garage never waits for a list that did not change.
 */
export function useVehicleMakes(options?: { readonly enabled?: boolean }) {
  return useQuery({
    queryKey: queryKeys.vehicleMakes(),
    queryFn: () => apiFetch('/vehicle-makes', vehicleMakeListResponseSchema),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: options?.enabled ?? true,
  });
}

export type { VehicleMake };
