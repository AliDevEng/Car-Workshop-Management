import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from './keys';

/**
 * The areas of the admin panel a mutation can make stale **beyond its own
 * records** — declared by the mutation, resolved here.
 *
 * Each hook used to refresh only its own domain, so completing a work order
 * (which deducts stock, records the out-odometer and empties the "klar för
 * upphämtning" queue) left the article page, the vehicle page and the
 * dashboard showing the state from before, for as long as their cached copy
 * was fresh. Declaring the effect as data keeps the knowledge of *what else a
 * write touches* next to the write, and the knowledge of *which keys that
 * means* in one place.
 */
export type AffectedDomain =
  | 'articles'
  | 'bookingRequests'
  | 'calendar'
  | 'customers'
  | 'dashboard'
  | 'vehicles';

const DOMAIN_ROOTS: Readonly<Record<AffectedDomain, () => QueryKey>> = {
  articles: queryKeys.articlesRoot,
  bookingRequests: queryKeys.bookingRequestsRoot,
  calendar: queryKeys.calendarRoot,
  customers: queryKeys.customersRoot,
  dashboard: queryKeys.dashboardRoot,
  vehicles: queryKeys.vehiclesRoot,
};

export async function invalidateDomains(
  queryClient: QueryClient,
  domains: readonly AffectedDomain[],
): Promise<void> {
  await Promise.all(
    domains.map((domain) =>
      queryClient.invalidateQueries({ queryKey: DOMAIN_ROOTS[domain]() }),
    ),
  );
}
