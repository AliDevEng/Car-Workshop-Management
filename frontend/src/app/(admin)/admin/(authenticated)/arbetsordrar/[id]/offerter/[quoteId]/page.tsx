import { QuoteDetailPage } from '@/components/admin/quote-detail';

export default async function ArbetsordrarOffertDetailPage({
  params,
}: {
  readonly params: Promise<{ quoteId: string }>;
}) {
  const { quoteId } = await params;
  return <QuoteDetailPage key={quoteId} quoteId={quoteId} />;
}
