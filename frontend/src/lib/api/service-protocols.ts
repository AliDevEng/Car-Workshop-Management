import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  IDEMPOTENCY_KEY_HEADER,
  serviceProtocolDetailSchema,
  serviceProtocolListResponseSchema,
  serviceProtocolResponseSchema,
  type CreateServiceProtocolInput,
  type ServiceProtocolResponse,
  type UpdateServiceProtocolInput,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

function listPath(base: string, params: { readonly limit?: number }): string {
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? base : `${base}?${query}`;
}

/** F10.3/F10.4 — every version of a work order's protocol, newest first (B8.5.3). */
export function useWorkOrderServiceProtocols(
  workOrderId: string,
  params: { readonly limit?: number } = {},
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.workOrderServiceProtocols(workOrderId, params),
    queryFn: () =>
      apiFetch(
        listPath(`/work-orders/${workOrderId}/service-protocols`, params),
        serviceProtocolListResponseSchema,
      ),
    enabled: (options.enabled ?? true) && workOrderId !== '',
  });
}

export function useServiceProtocol(id: string | null) {
  return useQuery({
    queryKey: queryKeys.serviceProtocol(id ?? ''),
    queryFn: () =>
      apiFetch(`/service-protocols/${id ?? ''}`, serviceProtocolDetailSchema),
    enabled: id !== null,
  });
}

function applyServiceProtocolResponse(
  queryClient: QueryClient,
  response: ServiceProtocolResponse,
): typeof response.protocol {
  queryClient.setQueryData(
    queryKeys.serviceProtocol(response.protocol.id),
    response.protocol,
  );
  void queryClient.invalidateQueries({
    queryKey: queryKeys.workOrderServiceProtocols(
      response.protocol.workOrderId,
      {},
    ),
  });
  return response.protocol;
}

export function useCreateServiceProtocol(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceProtocolInput) =>
      apiFetch(
        `/work-orders/${workOrderId}/service-protocols`,
        serviceProtocolResponseSchema,
        { method: 'POST', body: input },
      ),
    onSuccess: (response) => {
      applyServiceProtocolResponse(queryClient, response);
    },
  });
}

export function useUpdateServiceProtocol(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateServiceProtocolInput) =>
      apiFetch(`/service-protocols/${id}`, serviceProtocolResponseSchema, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (response) => {
      applyServiceProtocolResponse(queryClient, response);
    },
  });
}

/**
 * F10.4.1/F10.4.2 — finalising renders the PDF, spends the §4.4 number and
 * freezes the protocol, so it carries an `Idempotency-Key` exactly as the
 * quote's `/send` does, and for the same reason (§8.1).
 */
export function useFinaliseServiceProtocol(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      apiFetch(
        `/service-protocols/${id}/finalise`,
        serviceProtocolResponseSchema,
        { method: 'POST', headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey } },
      ),
    onSuccess: (response) => {
      applyServiceProtocolResponse(queryClient, response);
    },
  });
}

/** A correction: a new, clearly numbered document, never an edit (§6.7). */
export function useCorrectServiceProtocol(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateServiceProtocolInput) =>
      apiFetch(
        `/service-protocols/${id}/correct`,
        serviceProtocolResponseSchema,
        { method: 'POST', body: input },
      ),
    onSuccess: (response) => {
      applyServiceProtocolResponse(queryClient, response);
    },
  });
}
