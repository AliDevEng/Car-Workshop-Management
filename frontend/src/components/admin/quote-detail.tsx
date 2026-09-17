'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent } from 'react';
import { UNIT_LABELS, ore, type QuoteLine, type QuoteListItem } from 'shared';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { DocumentPreview } from '@/components/admin/document-preview';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { quoteStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { DetailSkeleton, ErrorState } from '@/components/admin/states';
import { WorkOrderTotalsPanel } from '@/components/admin/work-order-totals-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api';
import {
  useQuote,
  useReviseQuote,
  useRespondToQuote,
  useSendQuote,
  useUpdateQuote,
  useWorkOrderQuotes,
} from '@/lib/api/quotes';
import { formatCurrency } from '@/lib/format/currency';
import { formatDate, formatDateOnly } from '@/lib/format/date';
import { formatQuantityForInput } from '@/lib/form/quantity-input';

const RESPONSE_COPY: Readonly<
  Record<'ACCEPTED' | 'DECLINED', { title: string; description: string }>
> = {
  ACCEPTED: {
    title: 'Registrera accepterad offert',
    description: 'Offerten markeras som accepterad av kunden. Detta går inte att ångra.',
  },
  DECLINED: {
    title: 'Registrera avböjd offert',
    description: 'Offerten markeras som avböjd av kunden. Detta går inte att ångra.',
  },
};

/** F10.1/F10.2 — draft editing, sending, the customer's answer, and versions. */
export function QuoteDetailPage({ quoteId }: { readonly quoteId: string }) {
  const router = useRouter();
  const quoteQuery = useQuote(quoteId);
  const updateQuote = useUpdateQuote(quoteId);
  const sendQuote = useSendQuote(quoteId);
  const respondToQuote = useRespondToQuote(quoteId);
  const reviseQuote = useReviseQuote(quoteId);

  const [validUntilDraft, setValidUntilDraft] = useState<string | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [pendingResponse, setPendingResponse] = useState<
    'ACCEPTED' | 'DECLINED' | null
  >(null);
  const sendKeyRef = useRef<string | null>(null);

  const versionsQuery = useWorkOrderQuotes(quoteQuery.data?.workOrderId ?? '', {
    limit: 50,
  });

  const error =
    quoteQuery.error === null
      ? null
      : quoteQuery.error instanceof ApiError
        ? quoteQuery.error
        : ApiError.invalidResponse('Offerten kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void quoteQuery.refetch();
        }}
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  }

  if (quoteQuery.isPending || quoteQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const quote = quoteQuery.data;
  const validUntil = validUntilDraft ?? quote.validUntil;
  const alreadyRevised = (versionsQuery.data?.data ?? []).some(
    (version: QuoteListItem) => version.supersedesQuoteId === quote.id,
  );

  async function saveValidUntil(): Promise<void> {
    if (validUntilDraft === null || validUntilDraft === quote.validUntil) {
      setValidUntilDraft(null);
      return;
    }
    try {
      await updateQuote.mutateAsync({ validUntil: validUntilDraft });
      notifySuccess('Giltighetsdatumet är sparat.');
      setValidUntilDraft(null);
    } catch (caught) {
      notifyError(caught);
    }
  }

  async function handleSend(): Promise<void> {
    const key = sendKeyRef.current ?? crypto.randomUUID();
    sendKeyRef.current = key;
    try {
      await sendQuote.mutateAsync(key);
      notifySuccess('Offerten är skickad.');
      sendKeyRef.current = null;
      setConfirmSend(false);
    } catch (caught) {
      notifyError(caught);
    }
  }

  async function handleRespond(status: 'ACCEPTED' | 'DECLINED'): Promise<void> {
    try {
      await respondToQuote.mutateAsync({ status });
      notifySuccess(
        status === 'ACCEPTED' ? 'Svaret är registrerat: accepterad.' : 'Svaret är registrerat: avböjd.',
      );
      setPendingResponse(null);
    } catch (caught) {
      notifyError(caught);
    }
  }

  async function handleRevise(): Promise<void> {
    try {
      const response = await reviseQuote.mutateAsync({});
      notifySuccess('En ny version av offerten är skapad.');
      router.push(
        `/admin/arbetsordrar/${response.quote.workOrderId}/offerter/${response.quote.id}`,
      );
    } catch (caught) {
      notifyError(caught);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={
          <span>
            Admin /{' '}
            <Link
              href={`/admin/arbetsordrar/${quote.workOrderId}`}
              className="hover:underline"
            >
              Arbetsordrar / {quote.workOrderNumber ?? 'Utkast'}
            </Link>{' '}
            / {quote.number ?? `Utkast v${String(quote.revision)}`}
          </span>
        }
        title={quote.number ?? `Utkast v${String(quote.revision)}`}
        description={`${quote.vehicle.registrationNumberDisplay} · ${quote.customer.name}`}
        actions={<StatusBadge status={quoteStatus(quote.status)} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Card className="rounded-soft">
            <CardHeader>
              <CardTitle>Rader</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {quote.lines.map((line: QuoteLine) => (
                  <li
                    key={line.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp border border-border px-3 py-2 text-sm"
                  >
                    <span className="min-w-0 truncate">{line.description}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {formatQuantityForInput(line.quantity)} {UNIT_LABELS[line.unit]}
                      {' · '}
                      {formatCurrency(ore(line.totals.grossOre))}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {quote.documentId === null ? null : (
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Dokument</CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentPreview
                  documentId={quote.documentId}
                  fileName={`Offert-${quote.number ?? quote.id}.pdf`}
                />
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <WorkOrderTotalsPanel totals={quote.totals} />

          <Card className="rounded-soft">
            <CardHeader>
              <CardTitle>Giltighet</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {quote.status === 'DRAFT' ? (
                <Field>
                  <FieldLabel htmlFor="quote-valid-until">Giltig till</FieldLabel>
                  <Input
                    id="quote-valid-until"
                    type="date"
                    value={validUntil}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setValidUntilDraft(event.currentTarget.value);
                    }}
                    onBlur={() => void saveValidUntil()}
                  />
                </Field>
              ) : (
                <p className="text-sm">Giltig till {formatDateOnly(quote.validUntil)}</p>
              )}
              {quote.sentAt === null ? null : (
                <p className="text-xs text-muted-foreground">
                  Skickad {formatDate(quote.sentAt)}
                </p>
              )}
              {quote.respondedAt === null ? null : (
                <p className="text-xs text-muted-foreground">
                  Besvarad {formatDate(quote.respondedAt)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-soft">
            <CardHeader>
              <CardTitle>Åtgärder</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {quote.status === 'DRAFT' ? (
                <Button
                  type="button"
                  onClick={() => {
                    setConfirmSend(true);
                  }}
                >
                  Skicka offert
                </Button>
              ) : null}

              {quote.status === 'SENT' ? (
                <>
                  <Button
                    type="button"
                    onClick={() => {
                      setPendingResponse('ACCEPTED');
                    }}
                  >
                    Registrera accepterad
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      setPendingResponse('DECLINED');
                    }}
                  >
                    Registrera avböjd
                  </Button>
                </>
              ) : null}

              {quote.status === 'DRAFT' || alreadyRevised ? null : (
                <>
                  <p className="text-xs text-muted-foreground">
                    En skickad offert är skrivskyddad. Skapa en ny version för att
                    ändra den.
                  </p>
                  <Button
                    type="button"
                    variant="secondary"
                    isPending={reviseQuote.isPending}
                    onClick={() => void handleRevise()}
                  >
                    Skapa ny version
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={setConfirmSend}
        title="Skicka offert"
        description="Offerten blir en PDF med ett offertnummer och kan inte längre ändras. En ändring efter det skapar en ny version."
        confirmLabel="Skicka offert"
        destructive={false}
        isPending={sendQuote.isPending}
        onConfirm={() => void handleSend()}
      />

      {pendingResponse === null ? null : (
        <ConfirmDialog
          open
          onOpenChange={(nextOpen: boolean) => {
            if (!nextOpen) {
              setPendingResponse(null);
            }
          }}
          title={RESPONSE_COPY[pendingResponse].title}
          description={RESPONSE_COPY[pendingResponse].description}
          confirmLabel={
            pendingResponse === 'ACCEPTED'
              ? 'Registrera accepterad'
              : 'Registrera avböjd'
          }
          destructive={pendingResponse === 'DECLINED'}
          isPending={respondToQuote.isPending}
          onConfirm={() => void handleRespond(pendingResponse)}
        />
      )}
    </div>
  );
}
