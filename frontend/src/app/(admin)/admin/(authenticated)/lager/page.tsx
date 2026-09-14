import { PackageSearchIcon } from 'lucide-react';
import {
  UNIT_LABELS,
  articleSchema,
  paginatedResponseSchema,
  type Article,
} from 'shared';
import { PageHeader } from '@/components/admin/page-header';
import {
  ReadOnlyTable,
  type ReadOnlyColumn,
} from '@/components/admin/read-only-table';
import { EmptyState } from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { apiFetchServer } from '@/lib/api/server';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

const articleListResponseSchema = paginatedResponseSchema(articleSchema);

function articlesPath(params: AdminSearchParams): string {
  const query = new URLSearchParams({ limit: '20' });
  const lowStock = firstSearchParam(params, 'lowStock');
  if (lowStock !== undefined) {
    query.set('lowStock', lowStock);
  }
  return `/articles?${query.toString()}`;
}

const columns: readonly ReadOnlyColumn<Article>[] = [
  {
    header: 'Artikel',
    cell: (article: Article) => (
      <span className="block min-w-0">
        <span className="block truncate font-medium">{article.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {article.sku}
        </span>
      </span>
    ),
  },
  {
    header: 'Saldo',
    numeric: true,
    cell: (article: Article) =>
      `${article.stockQuantity} ${UNIT_LABELS[article.unit]}`,
  },
  {
    header: 'Minsta',
    numeric: true,
    cell: (article: Article) =>
      `${article.minimumQuantity} ${UNIT_LABELS[article.unit]}`,
  },
  { header: 'Plats', cell: (article: Article) => article.location ?? 'Saknas' },
];

export default async function InventoryPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const lowStock = firstSearchParam(params, 'lowStock') === 'true';
  const response = await apiFetchServer(
    articlesPath(params),
    articleListResponseSchema,
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={<span>Admin / Lager</span>}
        title="Lager"
        description={
          lowStock
            ? 'Artiklar där saldot ligger under minsta nivå.'
            : 'Aktiva artiklar i lager.'
        }
        actions={
          lowStock ? <Badge tone="hivis">Under minsta saldo</Badge> : undefined
        }
      />
      <ReadOnlyTable
        rows={response.data}
        columns={columns}
        rowKey={(article: Article) => article.id}
        caption="Lagerartiklar"
        empty={
          <EmptyState
            icon={PackageSearchIcon}
            message="Inga artiklar matchar filtret."
          />
        }
      />
    </div>
  );
}
