'use client';

import {
  BoxesIcon,
  PackageSearchIcon,
  PlusIcon,
  TriangleAlertIcon,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ChangeEvent } from 'react';
import { ore, type Article, type LowStockArticle } from 'shared';
import { ArticleFormDialog } from '@/components/admin/article-form-dialog';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { ListPage } from '@/components/admin/list-page';
import { PageHeader } from '@/components/admin/page-header';
import { stockLevelStatus } from '@/components/admin/status';
import {
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  lowStockExportPath,
  useArticles,
  useLowStockReport,
} from '@/lib/api/articles';
import { useCurrentUser } from '@/lib/api/current-user';
import { formatCurrency } from '@/lib/format/currency';
import { formatQuantity } from '@/lib/format/quantity';

const PAGE_SIZE = 25;
const SEARCH_DEBOUNCE_MS = 250;

/**
 * The subset of fields the list table actually renders, shared between the
 * paginated `Article` list and the dedicated, deficit-sorted `LowStockArticle`
 * report (F7.5.1) — one column set for both, rather than two near-identical
 * copies that would drift the moment a column changes.
 */
type ArticleStockRow = Pick<
  Article,
  | 'id'
  | 'sku'
  | 'name'
  | 'unit'
  | 'salesPriceOre'
  | 'stockQuantity'
  | 'minimumQuantity'
  | 'location'
>;

function StockCell({ row }: { readonly row: ArticleStockRow }) {
  const status = stockLevelStatus(row.stockQuantity, row.minimumQuantity);
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {formatQuantity(row.stockQuantity, row.unit)}
      {status === null ? null : (
        <TriangleAlertIcon
          aria-label={status.label}
          className={
            status.meaning === 'error'
              ? 'size-4 text-status-oxide'
              : 'size-4 text-status-hivis'
          }
        />
      )}
    </span>
  );
}

const columns: readonly DataTableColumn<ArticleStockRow>[] = [
  {
    id: 'article',
    header: 'Artikel',
    cell: (row: ArticleStockRow) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium">{row.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {row.sku}
        </span>
      </span>
    ),
  },
  {
    id: 'stock',
    header: 'Saldo',
    numeric: true,
    mobile: 'trailing',
    cell: (row: ArticleStockRow) => <StockCell row={row} />,
  },
  {
    id: 'minimum',
    header: 'Minsta',
    numeric: true,
    cell: (row: ArticleStockRow) =>
      formatQuantity(row.minimumQuantity, row.unit),
  },
  {
    id: 'price',
    header: 'Pris',
    numeric: true,
    cell: (row: ArticleStockRow) => formatCurrency(ore(row.salesPriceOre)),
  },
  {
    id: 'location',
    header: 'Plats',
    hideBelow: 'lg',
    cell: (row: ArticleStockRow) => row.location ?? 'Saknas',
  },
];

function matchesQuery(row: LowStockArticle, query: string): boolean {
  const term = query.trim().toLowerCase();
  if (term === '') {
    return true;
  }
  return (
    row.name.toLowerCase().includes(term) ||
    row.sku.toLowerCase().includes(term)
  );
}

export function ArticleListPage({
  initialQuery = '',
  initialLowStock = false,
}: {
  readonly initialQuery?: string;
  readonly initialLowStock?: boolean;
}) {
  const router = useRouter();
  const currentUserQuery = useCurrentUser();
  const isAdmin = currentUserQuery.data?.role === 'ADMIN';

  const [queryInput, setQueryInput] = useState(initialQuery);
  const [q, setQ] = useState(initialQuery);
  const [lowStock, setLowStock] = useState(initialLowStock);
  const [showInactive, setShowInactive] = useState(false);
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

  // F7.5.1 — the low-stock view is a dedicated report, not the paginated
  // list with a filter bolted on: `GET /api/articles/low-stock` is already
  // sorted by how far below minimum each article is (`getLowStockArticles`),
  // and re-deriving that order from the generic list (sorted `id desc`)
  // would silently drop the one thing F7.5.1 asks for. The two other list
  // filters do not apply to it — the report is always active-only and is
  // small enough (capped at 1000) that a free-text match is done here rather
  // than adding a query parameter the endpoint has no other reason to grow.
  const articlesQuery = useArticles(
    {
      ...(q === '' ? {} : { q }),
      ...(showInactive ? {} : { isActive: true }),
      ...(cursor === undefined ? {} : { cursor }),
      limit: PAGE_SIZE,
    },
    { enabled: !lowStock },
  );
  const lowStockQuery = useLowStockReport({ enabled: lowStock });

  const activeQuery = lowStock ? lowStockQuery : articlesQuery;
  const error =
    activeQuery.error === null
      ? null
      : activeQuery.error instanceof ApiError
        ? activeQuery.error
        : ApiError.invalidResponse('Lagerlistan kunde inte visas.');

  const rows: readonly ArticleStockRow[] = lowStock
    ? (lowStockQuery.data?.data.filter((row) => matchesQuery(row, q)) ?? [])
    : (articlesQuery.data?.data ?? []);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[{ label: 'Admin', href: '/admin' }, { label: 'Lager' }]}
        icon={BoxesIcon}
        accent="amber"
        title="Lager"
        description="Sök på artikelnummer, namn eller OE-nummer."
        actions={
          <div className="flex items-start gap-3">
            <a href={lowStockExportPath()} className="contents">
              <Button type="button" variant="secondary">
                Exportera bristlista
              </Button>
            </a>
            <div className="flex flex-col items-end gap-1">
              <ArticleFormDialog
                mode={{ kind: 'create' }}
                isAdmin={isAdmin}
                trigger={
                  // Creating an article always sets a price, and `POST
                  // /api/articles` is `ADMIN`-only at the route with no
                  // partial success for anyone else — unlike an edit, there
                  // is no non-price part of "create" a mechanic could
                  // complete. Disabled and explained rather than hidden
                  // (F7.2.4's own rule, extended here to the one action it
                  // does not by itself cover) — the explanation is the
                  // visible text below, not a `title` tooltip: that is not
                  // reliably announced to a screen reader and does nothing
                  // on a tablet, which has no hover.
                  <Button type="button" disabled={!isAdmin}>
                    <PlusIcon aria-hidden="true" />
                    Ny artikel
                  </Button>
                }
              />
              {isAdmin ? null : (
                <p className="text-xs text-muted-foreground">
                  Endast administratörer kan skapa artiklar.
                </p>
              )}
            </div>
          </div>
        }
      />

      <ListPage
        filters={
          <div className="flex flex-wrap items-end gap-3">
            <Input
              value={queryInput}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setQueryInput(event.currentTarget.value);
              }}
              placeholder="Sök artikel…"
              aria-label="Sök artikel"
              className="max-w-xs"
            />
            <Button
              type="button"
              variant={lowStock ? 'primary' : 'secondary'}
              size="lg"
              onClick={() => {
                setLowStock((current) => !current);
                setCursorStack([]);
              }}
              aria-pressed={lowStock}
            >
              Under minsta nivå
            </Button>
            <Button
              type="button"
              variant={showInactive ? 'primary' : 'secondary'}
              size="lg"
              disabled={lowStock}
              title={
                lowStock ? 'Bristlistan visar bara aktiva artiklar.' : undefined
              }
              onClick={() => {
                setShowInactive((current) => !current);
                setCursorStack([]);
              }}
              aria-pressed={showInactive}
            >
              Visa inaktiva
            </Button>
          </div>
        }
        table={
          error !== null ? (
            <ErrorState
              message={error.message}
              onRetry={() => {
                void activeQuery.refetch();
              }}
              {...(error.requestId === undefined
                ? {}
                : { requestId: error.requestId })}
            />
          ) : activeQuery.isPending ? (
            <TableSkeleton columns={columns.length} />
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              rowKey={(row: ArticleStockRow) => row.id}
              rowHref={(row: ArticleStockRow) => `/admin/lager/${row.id}`}
              caption="Artiklar"
              onRowActivate={(row: ArticleStockRow) => {
                router.push(`/admin/lager/${row.id}`);
              }}
              empty={
                <EmptyState
                  icon={PackageSearchIcon}
                  message={
                    lowStock
                      ? // F7.5.3 — good news, not an apology: nothing is
                        // missing from the workshop's shelves.
                        'Inga artiklar under minsta nivå. Lagret ser bra ut.'
                      : q === '' && !showInactive
                        ? 'Inga artiklar än. Lägg till den första.'
                        : 'Inga artiklar matchar filtret.'
                  }
                />
              }
              {...(lowStock
                ? {}
                : {
                    pagination: {
                      nextCursor: articlesQuery.data?.nextCursor ?? null,
                      canGoBack: cursorStack.length > 0,
                      isLoading: articlesQuery.isFetching,
                      onNext: () => {
                        const next = articlesQuery.data?.nextCursor;
                        if (next !== null && next !== undefined) {
                          setCursorStack((stack) => [...stack, next]);
                        }
                      },
                      onPrevious: () => {
                        setCursorStack((stack) => stack.slice(0, -1));
                      },
                    },
                  })}
            />
          )
        }
      />
    </div>
  );
}
