'use client';

import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type MouseEvent, type ReactNode } from 'react';
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
  /**
   * Drop this column below the given breakpoint rather than letting the
   * table scroll sideways inside a page that already scrolls. For the
   * columns that are useful but not what anyone scans the list for.
   */
  readonly hideBelow?: 'lg' | 'xl';
  /**
   * The column's job in the card layout below `md`, where a table is
   * unreadable (UI_UX_AUDIT L2).
   *
   *  - `primary` — the card's title line. Exactly one column should be this;
   *    without it the first column is used.
   *  - `trailing` — pinned to the card's top right. A status or an amount.
   *  - `hidden` — left out of the card entirely.
   *  - anything else — a labelled fact under the title.
   */
  readonly mobile?: 'primary' | 'trailing' | 'secondary' | 'hidden';
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
   * The row's own address.
   *
   * Rows used to navigate through `onClick` alone, which meant middle-click,
   * Ctrl/Cmd-click, "open in new tab" and link previews all did nothing —
   * and opening three work orders side by side is an ordinary workshop task
   * (UI_UX_AUDIT L3). With this, the row's title is a real `<Link>` and the
   * browser's own navigation affordances work; `onRowActivate` stays for the
   * plain click anywhere else on the row.
   */
  readonly rowHref?: (row: Row) => string;
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

const HIDE_BELOW_CLASS: Readonly<Record<'lg' | 'xl', string>> = {
  lg: 'hidden lg:table-cell',
  xl: 'hidden xl:table-cell',
};

/** True for a click the browser should handle as a link, not as a row press. */
function isBrowserNavigationClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

/**
 * The admin list table (F1.4.1).
 *
 * One scroll context: the table fills the page and the page scrolls, with a
 * sticky header. It used to carry its own `max-h-[70vh] overflow-auto`
 * inside a page that also scrolled, so a row could be scrolled two different
 * ways and the last column was clipped at the same time (UI_UX_AUDIT L1/G3).
 *
 * Below `md` the same column definitions render as cards instead, because a
 * five-column table on a 390 px phone shows one and a half of them.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  caption,
  onRowActivate,
  rowHref,
  sortableColumns,
  sort,
  onSortChange,
  pagination,
  empty,
}: DataTableProps<Row>) {
  const sortable = new Set(sortableColumns ?? []);
  const interactive = onRowActivate !== undefined;
  // Which button was pressed, so only it spins. Both used to receive the
  // shared `isLoading`, so clicking "Nästa" also spun "Föregående".
  const [pendingDirection, setPendingDirection] = useState<
    'previous' | 'next' | null
  >(null);
  const isPaging = pagination?.isLoading ?? false;

  function moveFocus(from: EventTarget & HTMLElement, delta: number): void {
    const row = from.closest('tr');
    const sibling =
      delta < 0 ? row?.previousElementSibling : row?.nextElementSibling;
    if (sibling instanceof HTMLElement) {
      sibling.focus();
    }
  }

  const [firstColumn] = columns;
  const primaryColumn =
    columns.find((column) => column.mobile === 'primary') ?? firstColumn;
  const trailingColumn = columns.find(
    (column) => column.mobile === 'trailing',
  );
  const secondaryColumns = columns.filter(
    (column) =>
      column !== primaryColumn &&
      column !== trailingColumn &&
      column.mobile !== 'hidden',
  );

  function renderPrimary(row: Row, column: DataTableColumn<Row>): ReactNode {
    if (rowHref === undefined) {
      return column.cell(row);
    }
    return (
      <Link
        href={rowHref(row)}
        className="block min-w-0 rounded-sharp underline-offset-4 hover:underline"
        // The row's own click handler already navigates; letting this one
        // through as well would push the same entry twice.
        onClick={(event) => {
          if (!isBrowserNavigationClick(event) && interactive) {
            event.preventDefault();
            onRowActivate(row);
          }
        }}
      >
        {column.cell(row)}
      </Link>
    );
  }

  function rowHandlers(row: Row) {
    if (!interactive) {
      return {};
    }
    return {
      onClick: (event: MouseEvent<HTMLElement>) => {
        // A click that landed on a control inside the row belongs to it.
        if (
          event.target instanceof Element &&
          event.target.closest('a,button,input,select,textarea') !== null
        ) {
          return;
        }
        if (isBrowserNavigationClick(event)) {
          return;
        }
        onRowActivate(row);
      },
    };
  }

  const showPagination =
    pagination !== undefined &&
    (pagination.canGoBack || pagination.nextCursor !== null);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {/* Cards below `md`, the table above it — one column definition
          driving both, so a new column cannot be added to only one. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.length === 0 ? (
          // No `empty`, no box — an empty bordered card says less than
          // nothing at all.
          empty === undefined ? null : (
            <li className="rounded-sharp border border-border">{empty}</li>
          )
        ) : (
          rows.map((row) => (
            <li
              key={rowKey(row)}
              className={cn(
                'rounded-sharp border border-border p-3',
                interactive && 'cursor-pointer hover:bg-accent',
              )}
              {...rowHandlers(row)}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 font-medium">
                  {primaryColumn === undefined
                    ? null
                    : renderPrimary(row, primaryColumn)}
                </div>
                {trailingColumn === undefined ? null : (
                  <div className="shrink-0 text-right tabular-nums">
                    {trailingColumn.cell(row)}
                  </div>
                )}
              </div>
              {secondaryColumns.length === 0 ? null : (
                <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                  {secondaryColumns.map((column) => (
                    <div key={column.id} className="min-w-0">
                      <dt className="text-muted-foreground">{column.header}</dt>
                      <dd
                        className={cn(
                          'min-w-0 truncate',
                          column.numeric === true && 'tabular-nums',
                        )}
                      >
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))
        )}
      </ul>

      <div className="relative hidden min-w-0 rounded-sharp border border-border md:block">
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
                      column.hideBelow === undefined
                        ? undefined
                        : HIDE_BELOW_CLASS[column.hideBelow],
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
                  // Focusable only when the row is not already represented by
                  // a link: with `rowHref` the link is the tab stop, and a
                  // second one leading to the same place is noise. There is
                  // also no `aria-label` here any more — it overrode every
                  // row's content, so a screen reader heard "Öppna
                  // Arbetsordrar" twenty-five times (UI_UX_AUDIT L7).
                  tabIndex={interactive && rowHref === undefined ? 0 : undefined}
                  className={cn(
                    interactive &&
                      'cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2',
                  )}
                  {...rowHandlers(row)}
                  onKeyDown={
                    interactive && rowHref === undefined
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
                        column.numeric === true
                          ? 'text-right tabular-nums'
                          : 'max-w-[28ch]',
                        column.hideBelow === undefined
                          ? undefined
                          : HIDE_BELOW_CLASS[column.hideBelow],
                      )}
                    >
                      {column === primaryColumn
                        ? renderPrimary(row, column)
                        : column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Hidden outright on a single page, rather than drawn with both
          buttons disabled (UI_UX_AUDIT L6). */}
      {!showPagination || pagination === undefined ? null : (
        <nav
          aria-label="Sidnavigering"
          className="flex items-center justify-end gap-2"
        >
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPendingDirection('previous');
              pagination.onPrevious();
            }}
            disabled={!pagination.canGoBack}
            isPending={isPaging && pendingDirection === 'previous'}
          >
            Föregående
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setPendingDirection('next');
              pagination.onNext();
            }}
            disabled={pagination.nextCursor === null}
            isPending={isPaging && pendingDirection === 'next'}
          >
            Nästa
          </Button>
        </nav>
      )}
    </div>
  );
}
