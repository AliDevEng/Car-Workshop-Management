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
  customersRoot: () => ['customers'] as const,
  customers: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.customersRoot(), params] as const,
  customer: (id: string) => [...queryKeys.customersRoot(), id] as const,
  vehiclesRoot: () => ['vehicles'] as const,
  vehicles: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.vehiclesRoot(), params] as const,
  vehicle: (id: string) => [...queryKeys.vehiclesRoot(), id] as const,
  odometerReadings: (vehicleId: string) =>
    [...queryKeys.vehiclesRoot(), vehicleId, 'odometer-readings'] as const,
};
