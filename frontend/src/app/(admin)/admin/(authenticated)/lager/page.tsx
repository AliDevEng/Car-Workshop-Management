import { ArticleListPage } from '@/components/admin/article-list';
import {
  firstSearchParam,
  type AdminSearchParams,
} from '@/lib/admin/search-params';

export default async function LagerPage({
  searchParams,
}: {
  readonly searchParams: Promise<AdminSearchParams>;
}) {
  const params = await searchParams;
  const initialQuery = firstSearchParam(params, 'q') ?? '';
  // `?lowStock=true` is the link the F5 dashboard's low-stock attention card
  // already uses (dashboard.tsx's `lowStockHref`).
  const initialLowStock = firstSearchParam(params, 'lowStock') === 'true';

  return (
    <ArticleListPage initialQuery={initialQuery} initialLowStock={initialLowStock} />
  );
}
