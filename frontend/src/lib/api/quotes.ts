import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  IDEMPOTENCY_KEY_HEADER,
  quoteDetailSchema,
  quoteListResponseSchema,
  quoteResponseSchema,
  type CreateQuoteInput,
  type QuoteResponse,
  type RespondToQuoteInput,
  type UpdateQuoteInput,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

/**
 * Only `limit` — this hook is only ever called scoped to one work order
 * (the `/work-orders/:id/quotes` route, F10.2.1). A top-level, unscoped
 * `/quotes` list with `status`/`workOrderId` filters is a different screen
 * nothing in F10 asks for; adding those fields here with nothing wiring
 * them up is exactly the dead surface CLAUDE.md warns against.
 */
export interface WorkOrderQuoteListParams {
  readonly limit?: number;
}

function quotesPath(base: string, params: WorkOrderQuoteListParams): string {
  const search = new URLSearchParams();
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? base : `${base}?${query}`;
}

/** F10.2.1 — every version of a work order's quote, newest first (B7.5.2). */
export function useWorkOrderQuotes(
  workOrderId: string,
  params: WorkOrderQuoteListParams = {},
  options: { readonly enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: queryKeys.workOrderQuotes(workOrderId, params),
    queryFn: () =>
      apiFetch(
        quotesPath(`/work-orders/${workOrderId}/quotes`, params),
        quoteListResponseSchema,
      ),
    enabled: (options.enabled ?? true) && workOrderId !== '',
  });
}

export function useQuote(id: string | null) {
  return useQuery({
    queryKey: queryKeys.quote(id ?? ''),
    queryFn: () => apiFetch(`/quotes/${id ?? ''}`, quoteDetailSchema),
    enabled: id !== null,
  });
}

/**
 * Every quote mutation answers with the full, freshly loaded detail — written
 * straight into the cache so a screen that just sent or revised a quote does
 * not need a second round trip, mirroring `applyWorkOrderResponse`.
 */
function applyQuoteResponse(
  queryClient: QueryClient,
  response: QuoteResponse,
): typeof response.quote {
  queryClient.setQueryData(queryKeys.quote(response.quote.id), response.quote);
  void queryClient.invalidateQueries({
    queryKey: queryKeys.workOrderQuotes(response.quote.workOrderId, {}),
  });
  return response.quote;
}

export function useCreateQuote(workOrderId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) =>
      apiFetch(`/work-orders/${workOrderId}/quotes`, quoteResponseSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (response) => {
      applyQuoteResponse(queryClient, response);
    },
  });
}

export function useUpdateQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateQuoteInput) =>
      apiFetch(`/quotes/${id}`, quoteResponseSchema, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: (response) => {
      applyQuoteResponse(queryClient, response);
    },
  });
}

/**
 * F10.1.3/F10.2.2 — sending renders the PDF, spends the §4.4 number and
 * freezes the quote, so it carries an `Idempotency-Key` exactly as work-order
 * completion does (§8.1): a lost response and a retried tap must replay
 * rather than send a second document.
 */
export function useSendQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (idempotencyKey: string) =>
      apiFetch(`/quotes/${id}/send`, quoteResponseSchema, {
        method: 'POST',
        headers: { [IDEMPOTENCY_KEY_HEADER]: idempotencyKey },
      }),
    onSuccess: (response) => {
      applyQuoteResponse(queryClient, response);
    },
  });
}

export function useRespondToQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RespondToQuoteInput) =>
      apiFetch(`/quotes/${id}/respond`, quoteResponseSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (response) => {
      applyQuoteResponse(queryClient, response);
    },
  });
}

/** F10.2.3 — a new version of a sent quote. Never edits the one it replaces. */
export function useReviseQuote(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateQuoteInput) =>
      apiFetch(`/quotes/${id}/revise`, quoteResponseSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: (response) => {
      applyQuoteResponse(queryClient, response);
    },
  });
}
