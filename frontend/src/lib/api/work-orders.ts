import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  IDEMPOTENCY_KEY_HEADER,
  workOrderDetailSchema,
  workOrderHistoryResponseSchema,
  workOrderListResponseSchema,
  workOrderResponseSchema,
  type ChangeWorkOrderStatusInput,
  type CreateWorkOrderInput,
  type CreateWorkOrderLineInput,
  type ReorderWorkOrderLinesInput,
  type UpdateWorkOrderInput,
  type UpdateWorkOrderLineInput,
  type WorkOrderDetail,
  type WorkOrderResponse,
  type WorkOrderStatus,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

export interface WorkOrderListParams {
  readonly status?: WorkOrderStatus;
  readonly assignedUserId?: string;
  readonly vehicleId?: string;
  readonly customerId?: string;
  readonly bookingId?: string;
  readonly cursor?: string;
  readonly limit?: number;
}

export function workOrdersPath(params: WorkOrderListParams): string {
  const search = new URLSearchParams();
  if (params.status !== undefined) {
    search.set('status', params.status);
  }
  if (params.assignedUserId !== undefined) {
    search.set('assignedUserId', params.assignedUserId);
  }
  if (params.vehicleId !== undefined) {
    search.set('vehicleId', params.vehicleId);
  }
  if (params.customerId !== undefined) {
    search.set('customerId', params.customerId);
  }
  if (params.bookingId !== undefined) {
    search.set('bookingId', params.bookingId);
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? '/work-orders' : `/work-orders?${query}`;
}

export function useWorkOrders(
  params: WorkOrderListParams,
  options?: { readonly enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.workOrders(params),
    queryFn: () =>
      apiFetch(workOrdersPath(params), workOrderListResponseSchema),
    enabled: options?.enabled ?? true,
  });
}

export function useWorkOrder(id: string | null) {
  return useQuery({
    queryKey: queryKeys.workOrder(id ?? ''),
    queryFn: () => apiFetch(`/work-orders/${id ?? ''}`, workOrderDetailSchema),
    enabled: id !== null,
  });
}

/**
 * Every work-order mutation answers with the complete, freshly recomputed
 * detail (§6.5) — the same envelope a plain `GET` returns, wrapped with
 * `warnings`. Writing that straight into the cache is what lets "the client
 * refetches lines and totals after every line mutation" (F9.6.1) cost one
 * round trip rather than two: no separate `GET` is needed after a write that
 * already carries the answer.
 */
function applyWorkOrderResponse(
  queryClient: QueryClient,
  response: WorkOrderResponse,
): WorkOrderDetail {
  const detailKey = queryKeys.workOrder(response.workOrder.id);
  queryClient.setQueryData(detailKey, response.workOrder);
  // The list rows and the history entries carry their own totals/status
  // snapshot, which a targeted cache write cannot cheaply reproduce, so this
  // still invalidates the whole root — but excluding the detail key just
  // written above. Without that exclusion, invalidating the root matches
  // every query under it (`queryKeys.workOrder`, `.workOrders`, both history
  // keys all start with the same root array) and, because the detail query
  // is normally the one screen actively mounted when this fires, would
  // immediately refetch the very record just set — exactly the round trip
  // this function's `setQueryData` exists to spare.
  void queryClient.invalidateQueries({
    queryKey: queryKeys.workOrdersRoot(),
    predicate: (query) =>
      JSON.stringify(query.queryKey) !== JSON.stringify(detailKey),
  });
  return response.workOrder;
}

export function useCreateWorkOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkOrderInput) =>
      apiFetch('/work-orders', workOrderResponseSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

export function useUpdateWorkOrder(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkOrderInput) =>
      apiFetch(`/work-orders/${id}`, workOrderResponseSchema, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

/**
 * F9.5.3 — completion (and every other status change) carries an
 * `Idempotency-Key`, so a retried request after a lost response is a replay
 * rather than a second side effect (§8.1). The caller mints and holds the
 * key for the lifetime of one completion *attempt* (F9.5.5); this hook only
 * ever sends whatever key it is given.
 */
export function useChangeWorkOrderStatus(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      input,
      idempotencyKey,
    }: {
      readonly input: ChangeWorkOrderStatusInput;
      readonly idempotencyKey: string;
    }) =>
      apiFetch(`/work-orders/${id}/status`, workOrderResponseSchema, {
        method: 'POST',
        body: input,
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

export function useAddWorkOrderLine(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateWorkOrderLineInput) =>
      apiFetch(`/work-orders/${workOrderId}/lines`, workOrderResponseSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

export function useUpdateWorkOrderLine(workOrderId: string, lineId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateWorkOrderLineInput) =>
      apiFetch(
        `/work-orders/${workOrderId}/lines/${lineId}`,
        workOrderResponseSchema,
        { method: 'PATCH', body: input },
      ),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

export function useDeleteWorkOrderLine(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) =>
      apiFetch(
        `/work-orders/${workOrderId}/lines/${lineId}`,
        workOrderResponseSchema,
        { method: 'DELETE' },
      ),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

export function useReorderWorkOrderLines(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReorderWorkOrderLinesInput) =>
      apiFetch(
        `/work-orders/${workOrderId}/lines/reorder`,
        workOrderResponseSchema,
        { method: 'POST', body: input },
      ),
    onSuccess: (response) => {
      applyWorkOrderResponse(queryClient, response);
    },
  });
}

// --- History (F9.7.1) --------------------------------------------------

export interface WorkOrderHistoryParams {
  readonly cursor?: string;
  readonly limit?: number;
}

function historyPath(base: string, params: WorkOrderHistoryParams): string {
  const search = new URLSearchParams();
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? base : `${base}?${query}`;
}

/** The vehicle's newest-first service history (§6.3, B6.8) — survives a
 * change of owner, because it hangs off the vehicle, not the customer. */
export function useVehicleWorkOrderHistory(
  vehicleId: string,
  params: WorkOrderHistoryParams = {},
) {
  return useQuery({
    queryKey: queryKeys.vehicleWorkOrderHistory(vehicleId, params),
    queryFn: () =>
      apiFetch(
        historyPath(`/vehicles/${vehicleId}/work-orders`, params),
        workOrderHistoryResponseSchema,
      ),
  });
}

/** The jobs billed to this customer — does not follow a car they sold. */
export function useCustomerWorkOrderHistory(
  customerId: string,
  params: WorkOrderHistoryParams = {},
) {
  return useQuery({
    queryKey: queryKeys.customerWorkOrderHistory(customerId, params),
    queryFn: () =>
      apiFetch(
        historyPath(`/customers/${customerId}/work-orders`, params),
        workOrderHistoryResponseSchema,
      ),
  });
}

export type { WorkOrderDetail, WorkOrderResponse };
