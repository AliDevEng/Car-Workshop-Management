import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import {
  customerDetailSchema,
  customerListItemSchema,
  customerSchema,
  paginatedResponseSchema,
  type CreateCustomerInput,
  type Customer,
  type CustomerDetail,
  type CustomerListItem,
  type CustomerType,
  type UpdateCustomerInput,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

const customerListResponseSchema = paginatedResponseSchema(
  customerListItemSchema,
);

export interface CustomerListParams {
  readonly q?: string;
  readonly isActive?: boolean;
  readonly type?: CustomerType;
  readonly cursor?: string;
  readonly limit?: number;
}

export function customersPath(params: CustomerListParams): string {
  const search = new URLSearchParams();
  if (params.q !== undefined && params.q !== '') {
    search.set('q', params.q);
  }
  if (params.isActive !== undefined) {
    search.set('isActive', String(params.isActive));
  }
  if (params.type !== undefined) {
    search.set('type', params.type);
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? '/customers' : `/customers?${query}`;
}

export function useCustomers(
  params: CustomerListParams,
  options?: { readonly enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.customers(params),
    queryFn: () => apiFetch(customersPath(params), customerListResponseSchema),
    // Keeps the current page's rows on screen while the next page (or a
    // changed filter) loads, rather than flashing the table to empty —
    // F6.1.1's cursor pagination reads as paging, not as reloading.
    placeholderData: keepPreviousData,
    enabled: options?.enabled ?? true,
  });
}

export function useCustomer(id: string | null) {
  return useQuery({
    queryKey: queryKeys.customer(id ?? ''),
    queryFn: () => apiFetch(`/customers/${id ?? ''}`, customerDetailSchema),
    enabled: id !== null,
  });
}

async function invalidateCustomerQueries(
  queryClient: QueryClient,
  id: string,
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.customersRoot() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.customer(id) }),
  ]);
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCustomerInput) =>
      apiFetch('/customers', customerSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.customersRoot(),
      });
    },
  });
}

export function useUpdateCustomer(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCustomerInput) =>
      apiFetch(`/customers/${id}`, customerSchema, {
        method: 'PATCH',
        body: input,
      }),
    onSuccess: async (updated: Customer) => {
      queryClient.setQueryData(
        queryKeys.customer(id),
        (previous: CustomerDetail | undefined) =>
          previous === undefined ? previous : { ...previous, ...updated },
      );
      await invalidateCustomerQueries(queryClient, id);
    },
  });
}

/** Toggles §4.3's `isActive` flag — never a hard delete (CLAUDE.md). */
export function useSetCustomerActive(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (isActive: boolean) =>
      apiFetch(
        `/customers/${id}/${isActive ? 'reactivate' : 'deactivate'}`,
        customerSchema,
        { method: 'POST' },
      ),
    onSuccess: async (updated: Customer) => {
      queryClient.setQueryData(
        queryKeys.customer(id),
        (previous: CustomerDetail | undefined) =>
          previous === undefined ? previous : { ...previous, ...updated },
      );
      await invalidateCustomerQueries(queryClient, id);
    },
  });
}

export type { Customer, CustomerDetail, CustomerListItem };
