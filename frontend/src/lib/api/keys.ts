/**
 * Query-key factory (F0.5.2). Every TanStack Query hook pulls its key from
 * here rather than an inline array, so an invalidation elsewhere in the app
 * cannot drift from the key a hook actually used.
 */
export const queryKeys = {
  health: () => ['health'] as const,
  currentUser: () => ['auth', 'me'] as const,
  search: (query: string) => ['search', query] as const,
  dashboardRoot: () => ['dashboard'] as const,
  dashboard: (date: string | null) =>
    [...queryKeys.dashboardRoot(), date ?? 'today'] as const,
};
