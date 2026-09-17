'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import {
  CHECKLIST_RESULT_LABELS,
  type ChecklistAnswer,
  type CreateServiceProtocolInput,
  type ServiceProtocolListItem,
  type UpdateServiceProtocolInput,
} from 'shared';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { DocumentPreview } from '@/components/admin/document-preview';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { ServiceProtocolForm } from '@/components/admin/service-protocol-form';
import { serviceProtocolStatus } from '@/components/admin/status';
import { StatusBadge } from '@/components/admin/status-badge';
import { DetailSkeleton, ErrorState } from '@/components/admin/states';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/lib/api';
import {
  useFinaliseServiceProtocol,
  useServiceProtocol,
  useUpdateServiceProtocol,
  useWorkOrderServiceProtocols,
} from '@/lib/api/service-protocols';
import { formatDateOnly, formatDateTime } from '@/lib/format/date';
import { formatOdometer } from '@/lib/format/odometer';

/** F10.4 — read-only once finalised; editable, with a save action, before. */
export function ServiceProtocolDetailPage({
  protocolId,
}: {
  readonly protocolId: string;
}) {
  const protocolQuery = useServiceProtocol(protocolId);
  const updateProtocol = useUpdateServiceProtocol(protocolId);
  const finaliseProtocol = useFinaliseServiceProtocol(protocolId);
  const [confirmFinalise, setConfirmFinalise] = useState(false);
  const idempotencyKeyRef = useRef<string | null>(null);

  const versionsQuery = useWorkOrderServiceProtocols(
    protocolQuery.data?.workOrderId ?? '',
    { limit: 50 },
  );

  const error =
    protocolQuery.error === null
      ? null
      : protocolQuery.error instanceof ApiError
        ? protocolQuery.error
        : ApiError.invalidResponse('Serviceprotokollet kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        onRetry={() => {
          void protocolQuery.refetch();
        }}
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  }

  if (protocolQuery.isPending || protocolQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const protocol = protocolQuery.data;
  const finalised = protocol.finalisedAt !== null;
  const alreadyCorrected = (versionsQuery.data?.data ?? []).some(
    (version: ServiceProtocolListItem) =>
      version.supersedesProtocolId === protocol.id,
  );

  async function handleSave(input: CreateServiceProtocolInput): Promise<void> {
    const updateInput: UpdateServiceProtocolInput = {
      odometerKm: input.odometerKm,
      checklist: input.checklist,
      nextServiceDueKm: input.nextServiceDueKm ?? null,
      nextServiceDueDate: input.nextServiceDueDate ?? null,
      notes: input.notes ?? null,
    };
    try {
      await updateProtocol.mutateAsync(updateInput);
      notifySuccess('Ändringarna är sparade.');
    } catch (caught) {
      notifyError(caught);
    }
  }

  async function handleFinalise(): Promise<void> {
    const key = idempotencyKeyRef.current ?? crypto.randomUUID();
    idempotencyKeyRef.current = key;
    try {
      await finaliseProtocol.mutateAsync(key);
      notifySuccess('Serviceprotokollet är finaliserat.');
      idempotencyKeyRef.current = null;
      setConfirmFinalise(false);
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
              href={`/admin/arbetsordrar/${protocol.workOrderId}`}
              className="hover:underline"
            >
              Arbetsordrar / {protocol.workOrderNumber ?? 'Utkast'}
            </Link>{' '}
            / {protocol.number ?? `Utkast v${String(protocol.revision)}`}
          </span>
        }
        title={protocol.number ?? `Utkast v${String(protocol.revision)}`}
        description={`${protocol.vehicle.registrationNumberDisplay} · ${protocol.vehicle.make} ${protocol.vehicle.model}`}
        actions={
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={serviceProtocolStatus(protocol.finalisedAt)} />
            {finalised && !alreadyCorrected ? (
              <Button variant="secondary" size="sm" asChild>
                <Link
                  href={`/admin/arbetsordrar/${protocol.workOrderId}/protokoll/ny?korrigera=${protocol.id}`}
                >
                  Skapa korrigering
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <Card className="rounded-soft">
        <CardHeader>
          <CardTitle>Uppgifter</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <span className="block text-xs text-muted-foreground">Utfört av</span>
            {protocol.performedBy.name}
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">Utfört</span>
            {formatDateTime(protocol.performedAt)}
          </div>
          <div>
            <span className="block text-xs text-muted-foreground">
              Mätarställning
            </span>
            <span className="tabular-nums">{formatOdometer(protocol.odometerKm)}</span>
          </div>
          {protocol.finalisedAt === null ? null : (
            <div>
              <span className="block text-xs text-muted-foreground">
                Finaliserad
              </span>
              {formatDateTime(protocol.finalisedAt)}
            </div>
          )}
        </CardContent>
      </Card>

      {finalised ? (
        <>
          <Card className="rounded-soft">
            <CardHeader>
              <CardTitle>Checklista</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2">
                {protocol.checklist.map((item: ChecklistAnswer) => (
                  <li
                    key={item.key}
                    className="flex flex-col gap-1 rounded-sharp border border-border p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{item.label}</span>
                      <span className="text-xs text-muted-foreground">
                        {CHECKLIST_RESULT_LABELS[item.result]}
                      </span>
                    </div>
                    {item.note === null || item.note === '' ? null : (
                      <p className="text-xs text-muted-foreground">{item.note}</p>
                    )}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <Card className="rounded-soft">
            <CardHeader>
              <CardTitle>Nästa service</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <span className="block text-xs text-muted-foreground">
                  Vid mätarställning
                </span>
                {protocol.nextServiceDueKm === null
                  ? 'Ej angivet'
                  : formatOdometer(protocol.nextServiceDueKm)}
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  Senast datum
                </span>
                {protocol.nextServiceDueDate === null
                  ? 'Ej angivet'
                  : formatDateOnly(protocol.nextServiceDueDate)}
              </div>
            </CardContent>
          </Card>

          {protocol.notes === null || protocol.notes === '' ? null : (
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Anteckningar</CardTitle>
              </CardHeader>
              <CardContent className="text-sm whitespace-pre-wrap">
                {protocol.notes}
              </CardContent>
            </Card>
          )}

          {protocol.documentId === null ? null : (
            <Card className="rounded-soft">
              <CardHeader>
                <CardTitle>Dokument</CardTitle>
              </CardHeader>
              <CardContent>
                <DocumentPreview
                  documentId={protocol.documentId}
                  fileName={`Serviceprotokoll-${protocol.number ?? protocol.id}.pdf`}
                />
              </CardContent>
            </Card>
          )}
        </>
      ) : (
        <>
          <ServiceProtocolForm
            initialTemplateId={protocol.checklistTemplateId}
            initialChecklist={protocol.checklist}
            initialOdometerKm={protocol.odometerKm}
            initialNextServiceDueKm={protocol.nextServiceDueKm}
            initialNextServiceDueDate={protocol.nextServiceDueDate ?? ''}
            initialNotes={protocol.notes ?? ''}
            submitLabel="Spara ändringar"
            isPending={updateProtocol.isPending}
            onSubmit={(input: CreateServiceProtocolInput) => void handleSave(input)}
          />

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={() => {
                setConfirmFinalise(true);
              }}
            >
              Finalisera serviceprotokoll
            </Button>
          </div>
        </>
      )}

      <ConfirmDialog
        open={confirmFinalise}
        onOpenChange={setConfirmFinalise}
        title="Finalisera serviceprotokoll"
        description="Ett finaliserat protokoll blir en PDF och kan inte längre ändras. En eventuell rättelse görs sedan som en korrigering."
        confirmLabel="Finalisera serviceprotokoll"
        destructive={false}
        isPending={finaliseProtocol.isPending}
        onConfirm={() => void handleFinalise()}
      />
    </div>
  );
}
