import { useQuery } from '@tanstack/react-query';
import { userRosterResponseSchema, type UserSummary } from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

/**
 * Every active user, for a booking's mechanic-assignment picker (F8.2.2).
 * `/api/users/roster` is `authenticated`, not `ADMIN`-only like the rest of
 * user management (`lib/api` has no other module for it) — assigning a
 * colleague to a job is an everyday task for a `MECHANIC`, not staff
 * administration.
 */
export function useUserRoster() {
  return useQuery({
    queryKey: queryKeys.userRoster(),
    queryFn: () => apiFetch('/users/roster', userRosterResponseSchema),
    // The staff list changes rarely; there is no reason to refetch it on
    // every calendar navigation the way bookings themselves are.
    staleTime: 5 * 60_000,
  });
}

export type { UserSummary };
