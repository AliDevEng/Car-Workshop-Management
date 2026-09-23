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
  /** The make/model catalogue. Reference data — one key, no parameters. */
  vehicleMakes: () => ['vehicle-makes'] as const,
  odometerReadings: (vehicleId: string) =>
    [...queryKeys.vehiclesRoot(), vehicleId, 'odometer-readings'] as const,
  articlesRoot: () => ['articles'] as const,
  articles: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.articlesRoot(), params] as const,
  article: (id: string) => [...queryKeys.articlesRoot(), id] as const,
  lowStockArticles: () => [...queryKeys.articlesRoot(), 'low-stock'] as const,
  stockMovementsRoot: (articleId: string) =>
    [...queryKeys.articlesRoot(), articleId, 'movements'] as const,
  stockMovements: <Params extends object>(
    articleId: string,
    params: Readonly<Params>,
  ) => [...queryKeys.stockMovementsRoot(articleId), params] as const,
  userRoster: () => ['users', 'roster'] as const,
  bookingRequestsRoot: () => ['booking-requests'] as const,
  bookingRequests: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.bookingRequestsRoot(), params] as const,
  calendarRoot: () => ['calendar'] as const,
  calendar: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.calendarRoot(), params] as const,
  partnerLinksRoot: () => ['partner-links'] as const,
  partnerLinks: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.partnerLinksRoot(), params] as const,
  workOrdersRoot: () => ['work-orders'] as const,
  workOrders: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.workOrdersRoot(), params] as const,
  workOrder: (id: string) => [...queryKeys.workOrdersRoot(), id] as const,
  vehicleWorkOrderHistory: <Params extends object>(
    vehicleId: string,
    params: Readonly<Params>,
  ) => [...queryKeys.workOrdersRoot(), 'vehicle', vehicleId, params] as const,
  customerWorkOrderHistory: <Params extends object>(
    customerId: string,
    params: Readonly<Params>,
  ) => [...queryKeys.workOrdersRoot(), 'customer', customerId, params] as const,
  quotesRoot: () => ['quotes'] as const,
  quotes: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.quotesRoot(), params] as const,
  quote: (id: string) => [...queryKeys.quotesRoot(), id] as const,
  workOrderQuotes: <Params extends object>(
    workOrderId: string,
    params: Readonly<Params>,
  ) => [...queryKeys.quotesRoot(), 'work-order', workOrderId, params] as const,
  serviceProtocolsRoot: () => ['service-protocols'] as const,
  serviceProtocols: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.serviceProtocolsRoot(), params] as const,
  serviceProtocol: (id: string) =>
    [...queryKeys.serviceProtocolsRoot(), id] as const,
  workOrderServiceProtocols: <Params extends object>(
    workOrderId: string,
    params: Readonly<Params>,
  ) =>
    [
      ...queryKeys.serviceProtocolsRoot(),
      'work-order',
      workOrderId,
      params,
    ] as const,
  checklistTemplatesRoot: () => ['checklist-templates'] as const,
  checklistTemplates: <Params extends object>(params: Readonly<Params>) =>
    [...queryKeys.checklistTemplatesRoot(), params] as const,
  checklistTemplate: (id: string) =>
    [...queryKeys.checklistTemplatesRoot(), id] as const,
  document: (id: string) => ['documents', id] as const,
};
