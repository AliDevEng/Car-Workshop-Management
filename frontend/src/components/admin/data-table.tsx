'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SortDirection } from 'shared';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

export interface DataTableColumn<Row> {
  /**
   * Must equal the column name the API uses. The sortable set is compared
   * against this, so a typo means the column silently stops being sortable
   * rather than sorting by something the cursor was not built for.
   */
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** Right-aligns and applies `tabular-nums`. Use for every number. */
  readonly numeric?: boolean;
  readonly width?: string;
}

export interface DataTableSort {
  readonly column: string;
  readonly direction: SortDirection;
}

export interface DataTablePagination {
  /** `null` once the caller has reached the end (§8.1). */
  readonly nextCursor: string | null;
  readonly onNext: () => void;
  readonly onPrevious: () => void;
  readonly canGoBack: boolean;
  readonly isLoading?: boolean;
}

export interface DataTableProps<Row> {
  readonly columns: readonly DataTableColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly caption: string;
  readonly onRowActivate?: (row: Row) => void;
  /**
   * **The column names the endpoint declares sortable, and nothing else.**
   *
   * F1.4.2 and PROJECT_SPEC.md §8.1: a cursor is only stable against the
   * sort key it was built for. A table that offers to sort by any column
   * will skip and repeat rows at page boundaries, and the symptom looks like
   * missing data rather than a paging bug — which is why this defaults to
   * *nothing being sortable* rather than to everything. Sorting is opt-in,
   * per endpoint, and the endpoint is the one that knows.
   */
  readonly sortableColumns?: readonly string[];
  readonly sort?: DataTableSort;
  readonly onSortChange?: (sort: DataTableSort) => void;
  readonly pagination?: DataTablePagination;
  /** Rendered in place of the table body when there are no rows. */
  readonly empty?: ReactNode;
}

/**
 * The admin list table (F1.4.1).
 *
 * Sticky header, tabular figures on numeric columns, rows that can be opened
 * by mouse or keyboard, and pagination driven by what the API declares.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  onRowActivate,
  sortableColumns,
  sort,
  onSortChange,
  pagination,
  empty,
}: DataTableProps<Row>) {
  const sortable = new Set(sortableColumns ?? []);
  const interactive = onRowActivate !== undefined;

  function moveFocus(from: EventTarget & HTMLElement, delta: number): void {
    const row = from.closest('tr');
    const sibling =
      delta < 0 ? row?.previousElementSibling : row?.nextElementSibling;
    if (sibling instanceof HTMLElement) {
      sibling.focus();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-h-[70vh] overflow-auto rounded-sharp border border-border">
        <Table>
          <caption className="sr-only">{caption}</caption>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              {columns.map((column) => {
                const canSort = sortable.has(column.id) && onSortChange;
                const active = sort?.column === column.id;
                return (
                  <TableHead
                    key={column.id}
                    style={
                      column.width === undefined
                        ? undefined
                        : { width: column.width }
                    }
                    className={cn(
                      'whitespace-nowrap',
                      column.numeric === true && 'text-right',
                    )}
                    aria-sort={
                      active
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : canSort
                          ? 'none'
                          : undefined
                    }
                  >
                    {canSort ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="-mx-3 font-medium"
                        onClick={() => {
                          onSortChange({
                            column: column.id,
                            direction:
                              active && sort.direction === 'asc'
                                ? 'desc'
                                : 'asc',
                          });
                        }}
                      >
                        {column.header}
                        {active ? (
                          sort.direction === 'asc' ? (
                            <ArrowUpIcon aria-hidden="true" />
                          ) : (
                            <ArrowDownIcon aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDownIcon
                            aria-hidden="true"
                            className="opacity-50"
                          />
                        )}
                      </Button>
                    ) : (
                      // Not a disabled button: an unsortable column should
                      // look like a heading, not like a control that is
                      // temporarily unavailable.
                      column.header
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="p-0">
                  {empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow
                  key={rowKey(row)}
                  // A row is only focusable when it actually does something.
                  // A tab stop that leads nowhere is worse than no tab stop.
                  tabIndex={interactive ? 0 : undefined}
                  aria-label={interactive ? `Öppna ${caption}` : undefined}
                  className={cn(
                    interactive &&
                      'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2',
                  )}
                  onClick={
                    interactive
                      ? () => {
                          onRowActivate(row);
                        }
                      : undefined
                  }
                  onKeyDown={
                    interactive
                      ? (event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            onRowActivate(row);
                            return;
                          }
                          if (event.key === 'ArrowDown') {
                            event.preventDefault();
                            moveFocus(event.currentTarget, 1);
                            return;
                          }
                          if (event.key === 'ArrowUp') {
                            event.preventDefault();
                            moveFocus(event.currentTarget, -1);
                          }
                        }
                      : undefined
                  }
                >
                  {columns.map((column) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        column.numeric === true && 'text-right tabular-nums',
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {pagination === undefined ? null : (
        <nav
          aria-label="Sidnavigering"
          className="flex items-center justify-end gap-2"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={pagination.onPrevious}
            disabled={!pagination.canGoBack}
            isPending={pagination.isLoading ?? false}
          >
            Föregående
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={pagination.onNext}
            disabled={pagination.nextCursor === null}
            isPending={pagination.isLoading ?? false}
          >
            Nästa
          </Button>
        </nav>
      )}
    </div>
  );
}
