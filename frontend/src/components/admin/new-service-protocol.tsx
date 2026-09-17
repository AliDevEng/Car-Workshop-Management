'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import type { CreateServiceProtocolInput } from 'shared';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { PageHeader } from '@/components/admin/page-header';
import { ServiceProtocolForm } from '@/components/admin/service-protocol-form';
import { DetailSkeleton, ErrorState } from '@/components/admin/states';
import { ApiError } from '@/lib/api';
import {
  useCorrectServiceProtocol,
  useCreateServiceProtocol,
  useServiceProtocol,
} from '@/lib/api/service-protocols';
import { useWorkOrder } from '@/lib/api/work-orders';

/**
 * F10.3 — a new protocol, and (via `?korrigera=`) §6.7's correction flow:
 * the same form, pre-filled from the protocol it replaces rather than
 * starting blank, posted to `/service-protocols/:id/correct` instead of the
 * work order's create route.
 */
export function NewServiceProtocolPage({
  workOrderId,
}: {
  readonly workOrderId: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const correctingId = searchParams.get('korrigera');

  const workOrderQuery = useWorkOrder(workOrderId);
  const originalQuery = useServiceProtocol(correctingId);
  const createProtocol = useCreateServiceProtocol(workOrderId);
  const correctProtocol = useCorrectServiceProtocol(correctingId ?? '');

  const isPending = correctingId === null
    ? workOrderQuery.isPending
    : workOrderQuery.isPending || originalQuery.isPending;

  const loadError =
    workOrderQuery.error ?? (correctingId === null ? null : originalQuery.error);
  const error =
    loadError === null
      ? null
      : loadError instanceof ApiError
        ? loadError
        : ApiError.invalidResponse('Arbetsordern kunde inte visas.');

  if (error !== null) {
    return (
      <ErrorState
        message={error.message}
        {...(error.requestId === undefined ? {} : { requestId: error.requestId })}
      />
    );
  }

  if (isPending || workOrderQuery.data === undefined) {
    return <DetailSkeleton />;
  }

  const workOrder = workOrderQuery.data;
  const original = correctingId === null ? null : (originalQuery.data ?? null);

  async function handleSubmit(input: CreateServiceProtocolInput): Promise<void> {
    try {
      const response =
        correctingId === null
          ? await createProtocol.mutateAsync(input)
          : await correctProtocol.mutateAsync(input);
      notifySuccess(
        correctingId === null
          ? 'Serviceprotokollet är skapat som utkast.'
          : 'Korrigeringen är skapad som utkast.',
      );
      router.push(
        `/admin/arbetsordrar/${workOrderId}/protokoll/${response.protocol.id}`,
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
            Admin / Arbetsordrar / {workOrder.number ?? 'Utkast'} /{' '}
            {correctingId === null ? 'Nytt serviceprotokoll' : 'Korrigering'}
          </span>
        }
        title={
          correctingId === null
            ? 'Nytt serviceprotokoll'
            : 'Korrigera serviceprotokoll'
        }
        description={`${workOrder.vehicle.registrationNumberDisplay} · ${workOrder.vehicle.make} ${workOrder.vehicle.model}`}
      />

      <ServiceProtocolForm
        initialTemplateId={original?.checklistTemplateId ?? null}
        {...(original === null ? {} : { initialChecklist: original.checklist })}
        initialOdometerKm={original?.odometerKm ?? workOrder.odometerKmOut ?? workOrder.odometerKmIn}
        initialNextServiceDueKm={original?.nextServiceDueKm ?? null}
        initialNextServiceDueDate={original?.nextServiceDueDate ?? ''}
        initialNotes={original?.notes ?? ''}
        submitLabel={correctingId === null ? 'Skapa protokoll' : 'Skapa korrigering'}
        isPending={createProtocol.isPending || correctProtocol.isPending}
        onSubmit={(input: CreateServiceProtocolInput) => void handleSubmit(input)}
        onCancel={() => {
          router.back();
        }}
      />
    </div>
  );
}
