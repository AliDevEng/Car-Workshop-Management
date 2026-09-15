import { ArticleDetailPage } from '@/components/admin/article-detail';

export default async function LagerDetailPage({
  params,
}: {
  readonly params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // `key={id}`: forces a full remount when navigating from one article's
  // detail page straight to another's (global search does this without a
  // round trip through the list). Without it, `ArticleDetailPage`'s own
  // `cursorStack` for the movement-history pager would survive the
  // navigation and hand the new article's `useStockMovements` call a cursor
  // that names a row from the *previous* article — a movement id that
  // exists, but not within this article's filtered set.
  return <ArticleDetailPage key={id} articleId={id} />;
}
