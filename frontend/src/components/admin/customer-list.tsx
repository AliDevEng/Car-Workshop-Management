'use client';

import { UsersRoundIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  type CustomerListItem,
  type CustomerType,
} from 'shared';
import { CreateCustomerDialog } from '@/components/admin/create-customer-dialog';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { ListPage } from '@/components/admin/list-page';
import { PageHeader } from '@/components/admin/page-header';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiError } from '@/lib/api';
import { useCustomers } from '@/lib/api/customers';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;
const TYPE_FILTER_ALL = 'ALL' as const;
type TypeFilter = CustomerType | typeof TYPE_FILTER_ALL;

const columns: readonly DataTableColumn<CustomerListItem>[] = [
  {
    id: 'name',
    header: 'Namn',
    cell: (customer) => (
      <span className="min-w-0">
        <span className="block truncate font-medium">{customer.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {CUSTOMER_TYPE_LABELS[customer.type]}
          {customer.isActive ? '' : ' · Inaktiv'}
        </span>
      </span>
    ),
  },
  {
    id: 'phone',
    header: 'Telefon',
    cell: (customer) => <span className="tabular-nums">{customer.phone}</span>,
  },
  {
    id: 'vehicleCount',
    header: 'Fordon',
    numeric: true,
    mobile: 'trailing',
    width: '96px',
    cell: (customer) => customer.vehicleCount,
  },
];

export function CustomerListPage({
  initialQuery = '',
}: {
  readonly initialQuery?: string;
}) {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [type, setType] = useState<TypeFilter>(TYPE_FILTER_ALL);
  const [cursorStack, setCursorStack] = useState<readonly string[]>([]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQ(queryInput.trim());
      setCursorStack([]);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [queryInput]);

  const cursor = cursorStack.at(-1);
  const customersQuery = useCustomers({
    ...(q === '' ? {} : { q }),
    ...(type === TYPE_FILTER_ALL ? {} : { type }),
    ...(cursor === undefined ? {} : { cursor }),
    limit: PAGE_SIZE,
  });

  const error =
    customersQuery.error === null
      ? null
      : customersQuery.error instanceof ApiError
        ? customersQuery.error
        : ApiError.invalidResponse('Kundlistan kunde inte visas.');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Kunder' }]}
        icon={UsersRoundIcon}
        accent="rose"
        title="Kunder"
        description="Sök på namn, telefon eller e-post."
        actions={<CreateCustomerDialog />}
      />

      <ListPage
        filters={
          <div className="flex flex-wrap items-end gap-3">
            <Input
              value={queryInput}
              onChange={(event) => {
                setQueryInput(event.currentTarget.value);
              }}
              placeholder="Sök kund…"
              aria-label="Sök kund"
              className="max-w-xs"
            />
            <Select
              value={type}
              onValueChange={(next) => {
                setType(next as TypeFilter);
                setCursorStack([]);
              }}
            >
              <SelectTrigger aria-label="Filtrera på typ" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TYPE_FILTER_ALL}>Alla typer</SelectItem>
                {CUSTOMER_TYPES.map((customerType) => (
                  <SelectItem key={customerType} value={customerType}>
                    {CUSTOMER_TYPE_LABELS[customerType]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
        table={
          error !== null ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void customersQuery.refetch();
              }}
              {...(error.requestId === undefined
                ? {}
                : { requestId: error.requestId })}
            />
          ) : customersQuery.isPending ? (
            <TableSkeleton columns={columns.length} />
          ) : (
            <DataTable
              columns={columns}
              rows={customersQuery.data?.data ?? []}
              rowKey={(customer) => customer.id}
              caption="Kunder"
              rowHref={(customer) => `/admin/kunder/${customer.id}`}
              onRowActivate={(customer) => {
                router.push(`/admin/kunder/${customer.id}`);
              }}
              empty={
                <EmptyState
                  icon={UsersRoundIcon}
                  message={
                    q === '' && type === TYPE_FILTER_ALL
                      ? 'Inga kunder än. Lägg till den första.'
                      : 'Inga kunder matchar filtret.'
                  }
                />
              }
              pagination={{
                nextCursor: customersQuery.data?.nextCursor ?? null,
                canGoBack: cursorStack.length > 0,
                isLoading: customersQuery.isFetching,
                onNext: () => {
                  const next = customersQuery.data?.nextCursor;
                  if (next !== null && next !== undefined) {
                    setCursorStack((stack) => [...stack, next]);
                  }
                },
                onPrevious: () => {
                  setCursorStack((stack) => stack.slice(0, -1));
                },
              }}
            />
          )
        }
      />
    </div>
  );
}
