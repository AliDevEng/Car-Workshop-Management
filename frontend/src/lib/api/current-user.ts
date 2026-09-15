import { useQuery } from '@tanstack/react-query';
import { currentUserSchema } from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

/**
 * The signed-in staff member, for the client components that gate a control
 * on role rather than only relying on the API to refuse it (F7.2.4, F7.6.2:
 * price and stock-adjustment controls are disabled and explained for a
 * non-admin, not hidden, so the API's own `ADMIN`-only check stays the real
 * enforcement and this is only what lets the UI explain itself).
 *
 * The authenticated layout already fetches `/auth/me` once, server-side, to
 * decide whether to redirect to the login page — this is a second, client-side
 * read of the same endpoint, cached under the same query key that F0.5.2
 * reserved for it. Session-cookie based and cheap, and it keeps role checks
 * out of prop-drilling through every page between the layout and a form three
 * levels down.
 */
export function useCurrentUser() {
  return useQuery({
    queryKey: queryKeys.currentUser(),
    queryFn: () => apiFetch('/auth/me', currentUserSchema),
  });
}
