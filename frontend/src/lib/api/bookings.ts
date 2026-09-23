import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import {
  bookingRequestListResponseSchema,
  bookingRequestSchema,
  bookingWithRelationsSchema,
  calendarResponseSchema,
  type BookingRequestStatus,
  type BookingWithRelations,
  type CalendarResponse,
  type ConfirmBookingRequestInput,
  type CreateBookingInput,
  type RejectBookingRequestInput,
  type UpdateBookingInput,
} from 'shared';
import { apiFetch } from './client';
import { queryKeys } from './keys';

// --- The staff inbox (F8.1) --------------------------------------------------

export interface BookingRequestListParams {
  readonly status?: BookingRequestStatus;
  readonly cursor?: string;
  readonly limit?: number;
}

export function bookingRequestsPath(
  params: BookingRequestListParams,
): string {
  const search = new URLSearchParams();
  if (params.status !== undefined) {
    search.set('status', params.status);
  }
  if (params.cursor !== undefined) {
    search.set('cursor', params.cursor);
  }
  if (params.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  const query = search.toString();
  return query === '' ? '/booking-requests' : `/booking-requests?${query}`;
}

export function useBookingRequests(params: BookingRequestListParams) {
  return useQuery({
    queryKey: queryKeys.bookingRequests(params),
    queryFn: () =>
      apiFetch(bookingRequestsPath(params), bookingRequestListResponseSchema),
    // Short but non-zero: the inbox badge and the inbox list often mount
    // together and should not each trigger their own request.
    staleTime: 10_000,
  });
}

async function invalidateBookingRequestQueries(
  queryClient: QueryClient,
): Promise<void> {
  await queryClient.invalidateQueries({
    queryKey: queryKeys.bookingRequestsRoot(),
  });
}

export function useConfirmBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      readonly id: string;
      readonly input: ConfirmBookingRequestInput;
    }) =>
      apiFetch(`/booking-requests/${id}/confirm`, bookingWithRelationsSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all([
        invalidateBookingRequestQueries(queryClient),
        queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() }),
      ]);
    },
  });
}

export function useRejectBookingRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      readonly id: string;
      readonly input: RejectBookingRequestInput;
    }) =>
      apiFetch(`/booking-requests/${id}/reject`, bookingRequestSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await invalidateBookingRequestQueries(queryClient);
    },
  });
}

// --- The calendar (F8.3–F8.5) ------------------------------------------------

export interface CalendarParams {
  readonly from: string;
  readonly to: string;
  readonly userId?: string;
}

export function calendarPath(params: CalendarParams): string {
  const search = new URLSearchParams({ from: params.from, to: params.to });
  if (params.userId !== undefined) {
    search.set('userId', params.userId);
  }
  return `/bookings?${search.toString()}`;
}

export function useCalendar(
  params: CalendarParams,
  options?: { readonly enabled?: boolean },
) {
  return useQuery({
    queryKey: queryKeys.calendar(params),
    queryFn: () => apiFetch(calendarPath(params), calendarResponseSchema),
    staleTime: 15_000,
    enabled: options?.enabled ?? true,
  });
}

/**
 * F8.5.2 — warms the cache for a range before the staff member navigates to
 * it, so moving a week forward or back reads from cache rather than showing
 * a loading state for a range that was entirely predictable.
 */
export function prefetchCalendar(
  queryClient: QueryClient,
  params: CalendarParams,
): Promise<void> {
  return queryClient.prefetchQuery({
    queryKey: queryKeys.calendar(params),
    queryFn: () => apiFetch(calendarPath(params), calendarResponseSchema),
    staleTime: 15_000,
  });
}

/**
 * A booking taken over the telephone (F8.8, `POST /api/bookings`).
 *
 * Invalidates the customer and vehicle lists as well as the calendar: the call
 * may have created either of them, and a register that does not show the
 * customer the staff member just wrote down looks broken in the exact moment
 * they would go looking for it.
 *
 * No optimistic update, unlike {@link useUpdateBooking}: there is no row to
 * patch yet, the server assigns the id, and the exclusion constraint may
 * refuse the slot — an optimistic booking that vanishes is worse than a
 * half-second wait.
 */
export function useCreateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateBookingInput) =>
      apiFetch('/bookings', bookingWithRelationsSchema, {
        method: 'POST',
        body: input,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.customersRoot() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.vehiclesRoot() }),
      ]);
    },
  });
}

type CalendarSnapshot = readonly [QueryKey, CalendarResponse | undefined][];

/**
 * Rescheduling, reassigning or changing a booking's status (F8.3.3, F8.4.2).
 *
 * Applied optimistically against every cached calendar range — a drag can be
 * dropped on a day that belongs to an adjacent, already-prefetched week — and
 * rolled back to the exact previous snapshot on a `409` from the exclusion
 * constraint (F8.3.4, F8.6.2). `onSettled` still refetches regardless of the
 * outcome, because a successful move can shift what an *adjacent* booking's
 * card should show (e.g. a reassignment changing which mechanic column it
 * renders in) in ways the optimistic patch does not attempt to predict.
 */
export function useUpdateBooking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      readonly id: string;
      readonly input: UpdateBookingInput;
    }) =>
      apiFetch(`/bookings/${id}`, bookingWithRelationsSchema, {
        method: 'PATCH',
        body: input,
      }),
    onMutate: async ({ id, input }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.calendarRoot() });
      const snapshot: CalendarSnapshot = queryClient.getQueriesData({
        queryKey: queryKeys.calendarRoot(),
      });

      queryClient.setQueriesData<CalendarResponse>(
        { queryKey: queryKeys.calendarRoot() },
        (previous) => {
          if (previous === undefined) {
            return previous;
          }
          return {
            ...previous,
            data: previous.data.map((booking) =>
              booking.id === id
                ? {
                    ...booking,
                    ...(input.startsAt === undefined
                      ? {}
                      : { startsAt: input.startsAt }),
                    ...(input.endsAt === undefined
                      ? {}
                      : { endsAt: input.endsAt }),
                    ...(input.status === undefined
                      ? {}
                      : { status: input.status }),
                    ...(input.note === undefined ? {} : { note: input.note }),
                    // `assignedUser`'s name cannot be derived from an id alone
                    // without the roster on hand; the settle-time refetch
                    // below corrects it as soon as the server responds.
                  }
                : booking,
            ),
          };
        },
      );

      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context === undefined) {
        return;
      }
      for (const [key, data] of context.snapshot) {
        queryClient.setQueryData(key, data);
      }
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: queryKeys.calendarRoot() });
    },
  });
}

export type { BookingWithRelations };
