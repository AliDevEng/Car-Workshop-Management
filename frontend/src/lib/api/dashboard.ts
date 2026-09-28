import { useQuery } from '@tanstack/react-query';
import { dashboardSchema, type Dashboard } from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

export function dashboardPath(date: string | null): string {
  if (date === null) {
    return '/dashboard';
  }

  const params = new URLSearchParams({ date });
  return `/dashboard?${params.toString()}`;
}

export function useDashboard(date: string | null) {
  return useQuery({
    queryKey: queryKeys.dashboard(date),
    queryFn: () => apiFetch(dashboardPath(date), dashboardSchema),
    staleTime: 15_000,
  });
}

export type { Dashboard };
