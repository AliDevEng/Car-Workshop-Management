'use client';

import { CarFrontIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Vehicle } from 'shared';
import { CreateVehicleDialog } from '@/components/admin/create-vehicle-dialog';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { ListPage } from '@/components/admin/list-page';
import { PageHeader } from '@/components/admin/page-header';
import { StatusBadge } from '@/components/admin/status-badge';
import { inspectionStatus } from '@/components/admin/status';
import { EmptyState, ErrorState, TableSkeleton } from '@/components/admin/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import { useVehicles } from '@/lib/api/vehicles';
import { formatDateOnly } from '@/lib/format/date';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;

const columns: readonly DataTableColumn<Vehicle>[] = [
  {
    id: 'registrationNumber',
    header: 'Regnr',
    cell: (vehicle) => (
      <span className="font-medium tabular-nums">
        {vehicle.registrationNumberDisplay}
      </span>
    ),
  },
  {
    id: 'vehicle',
    header: 'Fordon',
    cell: (vehicle) => `${vehicle.make} ${vehicle.model}`,
  },
  {
    id: 'inspection',
    header: 'Besiktning',
    cell: (vehicle) =>
      vehicle.nextInspectionDueDate === null ? (
        'Saknas'
      ) : (
        <span className="flex items-center gap-2">
          <span className="tabular-nums">
            {formatDateOnly(vehicle.nextInspectionDueDate)}
          </span>
          <StatusBadge
            status={inspectionStatus(vehicle.nextInspectionDueDate)}
          />
        </span>
      ),
  },
];

export function VehicleListPage({
  initialQuery = '',
  initialInspectionDueSoon = false,
}: {
  readonly initialQuery?: string;
  readonly initialInspectionDueSoon?: boolean;
}) {
  const router = useRouter();
  const [queryInput, setQueryInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [inspectionDueSoon, setInspectionDueSoon] = useState(
    initialInspectionDueSoon,
  );
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
  const vehiclesQuery = useVehicles({
    ...(q === '' ? {} : { q }),
    ...(inspectionDueSoon ? { inspectionDueSoon: true } : {}),
    ...(cursor === undefined ? {} : { cursor }),
    limit: PAGE_SIZE,
  });

  const error =
    vehiclesQuery.error === null
      ? null
      : vehiclesQuery.error instanceof ApiError
        ? vehiclesQuery.error
        : ApiError.invalidResponse('Fordonslistan kunde inte visas.');

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Fordon</span>}
        title="Fordon"
        description="Sök på registreringsnummer, märke eller modell."
        actions={<CreateVehicleDialog />}
      />

      <ListPage
        filters={
          <div className="flex flex-wrap items-center gap-3">
            <Input
              value={queryInput}
              onChange={(event) => {
                setQueryInput(event.currentTarget.value);
              }}
              placeholder="Sök fordon…"
              aria-label="Sök fordon"
              className="max-w-xs"
            />
            <Button
              type="button"
              variant={inspectionDueSoon ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => {
                setInspectionDueSoon((current) => !current);
                setCursorStack([]);
              }}
              aria-pressed={inspectionDueSoon}
            >
              Besiktning inom 60 dagar
            </Button>
          </div>
        }
        table={
          error !== null ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void vehiclesQuery.refetch();
              }}
              {...(error.requestId === undefined
                ? {}
                : { requestId: error.requestId })}
            />
          ) : vehiclesQuery.isPending ? (
            <TableSkeleton columns={columns.length} />
          ) : (
            <DataTable
              columns={columns}
              rows={vehiclesQuery.data?.data ?? []}
              rowKey={(vehicle) => vehicle.id}
              caption="Fordon"
              onRowActivate={(vehicle: Vehicle) => {
                router.push(`/admin/fordon/${vehicle.id}`);
              }}
              empty={
                <EmptyState
                  icon={CarFrontIcon}
                  message={
                    q === '' && !inspectionDueSoon
                      ? 'Inga fordon än. Lägg till det första.'
                      : 'Inga fordon matchar filtret.'
                  }
                />
              }
              pagination={{
                nextCursor: vehiclesQuery.data?.nextCursor ?? null,
                canGoBack: cursorStack.length > 0,
                isLoading: vehiclesQuery.isFetching,
                onNext: () => {
                  const next = vehiclesQuery.data?.nextCursor;
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
