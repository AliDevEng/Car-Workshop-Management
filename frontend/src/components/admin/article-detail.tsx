'use client';

import {
  ExternalLinkIcon,
  HashIcon,
  HistoryIcon,
  Link2Icon,
  PencilIcon,
} from 'lucide-react';
import { useState } from 'react';
import {
  STOCK_MOVEMENT_TYPE_LABELS,
  UNIT_LABELS,
  buildPartnerUrl,
  ore,
  parseQuantity,
  type PartnerLink,
  type StockMovementWithUser,
} from 'shared';
import { ArticleFormDialog } from '@/components/admin/article-form-dialog';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { DataTable, type DataTableColumn } from '@/components/admin/data-table';
import { DetailLayout } from '@/components/admin/detail-layout';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { StockAdjustmentDialog } from '@/components/admin/stock-adjustment-dialog';
import { StocktakeDialog } from '@/components/admin/stocktake-dialog';
import { stockLevelStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import {
  DetailSkeleton,
  EmptyState,
  ErrorState,
  TableSkeleton,
} from '@/components/admin/states';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import {
  useArticle,
  useSetArticleActive,
  useStockMovements,
} from '@/lib/api/articles';
import { useCurrentUser } from '@/lib/api/current-user';
import { usePartnerLinks } from '@/lib/api/partner-links';
import { formatCurrency } from '@/lib/format/currency';
import { formatDate, formatDateTime } from '@/lib/format/date';
import { formatSignedQuantity } from '@/lib/format/quantity';
import { formatQuantityForInput } from '@/lib/form/quantity-input';
import { formatQuantity } from '@/lib/format/quantity';

const MOVEMENTS_PAGE_SIZE = 20;

const movementColumns: readonly DataTableColumn<StockMovementWithUser>[] = [
  {
    id: 'occurredAt',
    header: 'Datum',
    cell: (movement: StockMovementWithUser) => (
      <span className="tabular-nums">{formatDateTime(movement.occurredAt)}</span>
    ),
  },
  {
    id: 'type',
    header: 'Typ',
    cell: (movement: StockMovementWithUser) =>
      STOCK_MOVEMENT_TYPE_LABELS[movement.type],
  },
  {
    id: 'quantity',
    header: 'Antal',
    numeric: true,
    cell: (movement: StockMovementWithUser) =>
      formatSignedQuantity(parseQuantity(movement.quantity)),
  },
  {
    id: 'balanceAfter',
    header: 'Saldo efter',
    numeric: true,
    cell: (movement: StockMovementWithUser) =>
      formatQuantityForInput(movement.balanceAfter),
  },
  {
    id: 'user',
    header: 'Användare',
    cell: (movement: StockMovementWithUser) => movement.user.name,
  },
  {
    id: 'workOrder',
    header: 'Arbetsorder',
    cell: (movement: StockMovementWithUser) =>
      movement.workOrderId === null ? (
        '—'
      ) : (
        <span
          className="font-mono text-xs tabular-nums"
          title={movement.workOrderId}
        >
          {movement.workOrderId.slice(0, 8)}
        </span>
      ),
  },
];

export function ArticleDetailPage({ articleId }: { readonly articleId: string }) {
  const articleQuery = useArticle(articleId);
  const currentUserQuery = useCurrentUser();
  const isAdmin = currentUserQuery.data?.role === 'ADMIN';
  const setActive = useSetArticleActive(articleId);
  const partnerLinksQuery = usePartnerLinks({ isActive: true });
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [cursorStack, setCursorStack] = useState<readonly string[]>([]);

  const cursor = cursorStack.at(-1);
  const movementsQuery = useStockMovements(articleId, {
    ...(cursor === undefined ? {} : { cursor }),
    limit: MOVEMENTS_PAGE_SIZE,
  });
  const movementsError =
    movementsQuery.error === null
      ? null
      : movementsQuery.error instanceof ApiError
        ? movementsQuery.error
        : ApiError.invalidResponse('Rörelsehistoriken kunde inte visas.');

  const error =
    articleQuery.error === null
      ? null
      : articleQuery.error instanceof ApiError
        ? articleQuery.error
        : ApiError.invalidResponse('Artikeln kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void articleQuery.refetch();
        }}
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  }

  if (articleQuery.isPending || articleQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const article = articleQuery.data;
  const levelStatus = stockLevelStatus(article.stockQuantity, article.minimumQuantity);
  const articleNumberPartnerLinks = (partnerLinksQuery.data?.data ?? []).filter(
    (link: PartnerLink) => link.placeholderType === 'ARTICLE_NUMBER',
  );
  const adjustmentDisabledReason = isAdmin
    ? undefined
    : 'Endast administratörer kan justera lagret.';
  // `exactOptionalPropertyTypes` refuses `disabledReason: undefined` outright
  // — the prop must be absent, not present-and-undefined (CLAUDE.md's stated
  // caveat for the flag) — so this is spread rather than passed directly.
  const disabledReasonProp =
    adjustmentDisabledReason === undefined
      ? {}
      : { disabledReason: adjustmentDisabledReason };

  async function toggleActive(): Promise<void> {
    try {
      const next = await setActive.mutateAsync(!article.isActive);
      notifySuccess(
        next.isActive ? 'Artikeln är återaktiverad.' : 'Artikeln är inaktiverad.',
      );
      setConfirmDeactivate(false);
    } catch (caught) {
      notifyError(caught);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[
          { label: 'Admin', href: '/admin' },
          { label: 'Lager', href: '/admin/lager' },
          { label: article.name },
        ]}
        title={article.name}
        description={`${article.sku} · ${UNIT_LABELS[article.unit]}`}
        actions={
          <div className="flex items-center gap-2">
            {article.isActive ? null : <Badge tone="neutral">Inaktiv</Badge>}
            <ArticleFormDialog
              mode={{ kind: 'edit', article }}
              isAdmin={isAdmin}
              trigger={
                <Button type="button" variant="secondary">
                  <PencilIcon aria-hidden="true" />
                  Redigera artikel
                </Button>
              }
            />
            {article.isActive ? (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="ml-2 text-destructive hover:text-destructive"
                  onClick={() => {
                    setConfirmDeactivate(true);
                  }}
                >
                  Inaktivera artikel
                </Button>
                <ConfirmDialog
                  open={confirmDeactivate}
                  onOpenChange={setConfirmDeactivate}
                  title="Inaktivera artikel"
                  description={`${article.name} döljs från aktiva listor men behåller sin lagerhistorik. Artikeln kan återaktiveras när som helst.`}
                  confirmLabel="Inaktivera artikel"
                  onConfirm={() => {
                    void toggleActive();
                  }}
                  isPending={setActive.isPending}
                />
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  void toggleActive();
                }}
                isPending={setActive.isPending}
              >
                Återaktivera artikel
              </Button>
            )}
          </div>
        }
      />

      <DetailLayout
        main={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Lagerstatus</CardTitle>
                <CardAction>
                  <div className="flex flex-wrap gap-2">
                    <StockAdjustmentDialog
                      articleId={articleId}
                      unit={article.unit}
                      currentQuantity={article.stockQuantity}
                      disabled={!isAdmin}
                      {...disabledReasonProp}
                    />
                    <StocktakeDialog
                      articleId={articleId}
                      unit={article.unit}
                      currentQuantity={article.stockQuantity}
                      disabled={!isAdmin}
                      {...disabledReasonProp}
                    />
                  </div>
                </CardAction>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-baseline gap-3">
                  <p className="text-3xl font-semibold tabular-nums">
                    {formatQuantity(article.stockQuantity, article.unit)}
                  </p>
                  {levelStatus === null ? null : <StatusBadge status={levelStatus} />}
                </div>
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Minsta saldo</dt>
                    <dd className="tabular-nums">
                      {formatQuantity(article.minimumQuantity, article.unit)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Hyllplats</dt>
                    <dd>{article.location ?? 'Saknas'}</dd>
                  </div>
                </dl>
                {isAdmin ? null : (
                  <p className="text-xs text-muted-foreground">
                    {adjustmentDisabledReason}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Rörelsehistorik</CardTitle>
              </CardHeader>
              <CardContent>
                {movementsError !== null ? (
                  <ErrorState
                    message={movementsError.message}
                    onRetry={() => {
                      void movementsQuery.refetch();
                    }}
                    {...(movementsError.requestId === undefined
                      ? {}
                      : { requestId: movementsError.requestId })}
                  />
                ) : movementsQuery.isPending ? (
                  <TableSkeleton columns={movementColumns.length} />
                ) : (
                  <DataTable
                    columns={movementColumns}
                    rows={movementsQuery.data?.data ?? []}
                    rowKey={(movement: StockMovementWithUser) => movement.id}
                    caption="Lagerrörelser"
                    empty={
                      <EmptyState
                        icon={HistoryIcon}
                        message="Inga lagerrörelser än."
                      />
                    }
                    pagination={{
                      nextCursor: movementsQuery.data?.nextCursor ?? null,
                      canGoBack: cursorStack.length > 0,
                      isLoading: movementsQuery.isFetching,
                      onNext: () => {
                        const next = movementsQuery.data?.nextCursor;
                        if (next !== null && next !== undefined) {
                          setCursorStack((stack) => [...stack, next]);
                        }
                      },
                      onPrevious: () => {
                        setCursorStack((stack) => stack.slice(0, -1));
                      },
                    }}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        }
        aside={
          <div className="flex flex-col gap-4">
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Prisuppgifter</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Försäljningspris (exkl. moms)
                  </span>
                  <span className="tabular-nums">
                    {formatCurrency(ore(article.salesPriceOre))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">
                    Inköpspris (exkl. moms)
                  </span>
                  <span className="tabular-nums">
                    {article.purchasePriceOre === null
                      ? 'Saknas'
                      : formatCurrency(ore(article.purchasePriceOre))}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Momssats</span>
                  <span className="tabular-nums">
                    {new Intl.NumberFormat('sv-SE').format(article.vatRateBps / 100)} %
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>OE-nummer</CardTitle>
              </CardHeader>
              <CardContent>
                {article.oeNumbers.length === 0 ? (
                  <EmptyState inline icon={HashIcon} message="Inga OE-nummer sparade." />
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {article.oeNumbers.map((oeNumber: string) => (
                      <Badge key={oeNumber} tone="neutral">
                        {oeNumber}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Beside the OE numbers they are built from, and below
                Prisuppgifter — which used to sit under an often-empty
                Partnerlänkar card in the main column (UI_UX_AUDIT R4). */}
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Partnerlänkar</CardTitle>
              </CardHeader>
              <CardContent>
                {articleNumberPartnerLinks.length === 0 ||
                article.oeNumbers.length === 0 ? (
                  <EmptyState
                    inline
                    icon={Link2Icon}
                    message={
                      article.oeNumbers.length === 0
                        ? 'Lägg till ett OE-nummer för att få snabblänkar.'
                        : 'Inga partnerlänkar är konfigurerade än.'
                    }
                  />
                ) : (
                  <div className="flex flex-col gap-3">
                    {article.oeNumbers.map((oeNumber: string) => (
                      <div key={oeNumber} className="flex flex-wrap items-center gap-2">
                        <Badge tone="neutral" className="tabular-nums">
                          {oeNumber}
                        </Badge>
                        {articleNumberPartnerLinks.map((link: PartnerLink) => (
                          <Button key={link.id} asChild variant="secondary" size="sm">
                            <a
                              href={buildPartnerUrl(link, oeNumber)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              {link.name}
                              <ExternalLinkIcon aria-hidden="true" />
                            </a>
                          </Button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-soft" size="sm">
              <CardHeader>
                <CardTitle className="text-xs text-muted-foreground">
                  Registrerad i systemet
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                {formatDate(article.createdAt)}
              </CardContent>
            </Card>
          </div>
        }
      />
    </div>
  );
}
