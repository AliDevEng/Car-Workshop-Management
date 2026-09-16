'use client';

import {
  ArrowDownIcon,
  ArrowUpIcon,
  GripVerticalIcon,
  ListIcon,
  TrashIcon,
} from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import {
  WORK_ORDER_LINE_TYPE_LABELS,
  ore,
  type Ore,
  type UpdateWorkOrderLineInput,
  type WorkOrderDetail,
  type WorkOrderLine,
} from 'shared';
import { AddWorkOrderLineDialog } from '@/components/admin/add-work-order-line-dialog';
import { ConfirmDialog } from '@/components/admin/confirm-dialog';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { EmptyState } from '@/components/admin/states';
import { MoneyInput } from '@/components/form/money-input';
import { QuantityInput } from '@/components/form/quantity-input';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDraftField } from '@/lib/admin/use-draft-field';
import { useArticle } from '@/lib/api/articles';
import {
  useDeleteWorkOrderLine,
  useReorderWorkOrderLines,
  useUpdateWorkOrderLine,
} from '@/lib/api/work-orders';
import { formatCurrency } from '@/lib/format/currency';

function WorkOrderLineRow({
  workOrderId,
  line,
  index,
  lineCount,
  locked,
  reorderDisabled,
  onMove,
  onDragStart,
  onDragOver,
  onDrop,
}: {
  readonly workOrderId: string;
  readonly line: WorkOrderLine;
  readonly index: number;
  readonly lineCount: number;
  readonly locked: boolean;
  readonly reorderDisabled: boolean;
  readonly onMove: (index: number, direction: -1 | 1) => void;
  readonly onDragStart: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDragOver: (event: DragEvent<HTMLLIElement>) => void;
  readonly onDrop: (event: DragEvent<HTMLLIElement>) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const updateLine = useUpdateWorkOrderLine(workOrderId, line.id);
  const deleteLine = useDeleteWorkOrderLine(workOrderId);
  const articleQuery = useArticle(
    line.type === 'PART' ? (line.articleId ?? null) : null,
  );

  const descriptionField = useDraftField(line.description);
  const quantityField = useDraftField(line.quantity);
  const priceField = useDraftField<Ore>(ore(line.unitPriceOre));

  /**
   * Clears "dirty" only once the write actually lands. Clearing it
   * unconditionally before the request settles would mark a *failed* save
   * clean too — inviting a later background refetch to silently replace the
   * user's still-unsaved edit with the old server value, exactly the kind of
   * quiet data loss `useDraftField` exists to prevent.
   */
  async function commit(patch: UpdateWorkOrderLineInput): Promise<boolean> {
    try {
      await updateLine.mutateAsync(patch);
      return true;
    } catch (error) {
      notifyError(error);
      return false;
    }
  }

  async function commitDescription(): Promise<void> {
    const trimmed = descriptionField.draft.trim();
    if (trimmed === '' || trimmed === line.description) {
      descriptionField.clearDirty();
      return;
    }
    if (await commit({ description: trimmed })) {
      descriptionField.clearDirty();
    }
  }

  async function commitQuantity(): Promise<void> {
    const value = quantityField.draft;
    if (value === line.quantity) {
      quantityField.clearDirty();
      return;
    }
    if (await commit({ quantity: value })) {
      quantityField.clearDirty();
    }
  }

  async function commitPrice(): Promise<void> {
    const value = priceField.draft;
    if (value === line.unitPriceOre) {
      priceField.clearDirty();
      return;
    }
    if (await commit({ unitPriceOre: value })) {
      priceField.clearDirty();
    }
  }

  async function handleDelete(): Promise<void> {
    try {
      await deleteLine.mutateAsync(line.id);
      notifySuccess('Raden är borttagen.');
      setConfirmDelete(false);
    } catch (error) {
      notifyError(error);
    }
  }

  const currentArticlePriceOre = articleQuery.data?.salesPriceOre;
  const priceDiffers =
    currentArticlePriceOre !== undefined &&
    currentArticlePriceOre !== line.unitPriceOre;

  return (
    <li
      draggable={!locked && !reorderDisabled}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className="grid grid-cols-[28px_minmax(0,1fr)_120px_140px_auto] items-start gap-3 border-b border-border py-3 last:border-b-0"
    >
      <div className="flex flex-col items-center gap-1 pt-1">
        {locked ? null : (
          <GripVerticalIcon
            aria-hidden="true"
            className="size-4 shrink-0 cursor-grab text-muted-foreground"
          />
        )}
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={locked || reorderDisabled || index === 0}
          aria-label="Flytta upp"
          onClick={() => {
            onMove(index, -1);
          }}
        >
          <ArrowUpIcon aria-hidden="true" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={locked || reorderDisabled || index === lineCount - 1}
          aria-label="Flytta ner"
          onClick={() => {
            onMove(index, 1);
          }}
        >
          <ArrowDownIcon aria-hidden="true" />
        </Button>
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted-foreground">
          {WORK_ORDER_LINE_TYPE_LABELS[line.type]}
        </span>
        <Input
          aria-label="Beskrivning"
          value={descriptionField.draft}
          disabled={locked}
          onChange={(event) => {
            descriptionField.onChange(event.currentTarget.value);
          }}
          onBlur={() => {
            void commitDescription();
          }}
        />
        {priceDiffers && currentArticlePriceOre !== undefined ? (
          <p className="text-xs text-muted-foreground">
            Artikelns nuvarande pris är{' '}
            {formatCurrency(ore(currentArticlePriceOre))}. Radens pris behålls.
          </p>
        ) : null}
      </div>

      <QuantityInput
        aria-label="Antal"
        unit={line.unit}
        value={quantityField.draft}
        disabled={locked}
        onChange={(value) => {
          if (value !== null) {
            quantityField.onChange(value);
          }
        }}
        onBlur={() => {
          void commitQuantity();
        }}
      />

      <MoneyInput
        aria-label="Á-pris exkl. moms"
        value={priceField.draft}
        disabled={locked}
        onChange={(value) => {
          if (value !== null) {
            priceField.onChange(value);
          }
        }}
        onBlur={() => {
          void commitPrice();
        }}
      />

      <div className="flex flex-col items-end gap-2">
        <span className="tabular-nums font-medium">
          {formatCurrency(ore(line.totals.grossOre))}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          disabled={locked}
          aria-label="Ta bort rad"
          onClick={() => {
            setConfirmDelete(true);
          }}
        >
          <TrashIcon aria-hidden="true" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Ta bort rad"
        description={`Raden "${line.description}" tas bort från arbetsordern.`}
        confirmLabel="Ta bort rad"
        isPending={deleteLine.isPending}
        onConfirm={() => {
          void handleDelete();
        }}
      />
    </li>
  );
}

/**
 * F9.3 — lines. Drag-and-drop reorders (native HTML5 drag, the same
 * mechanism F8's calendar uses for rescheduling), with "Flytta upp"/"Flytta
 * ner" buttons as the required keyboard alternative (F9.3.4). Locked once
 * the order is `COMPLETED` or `CANCELLED`, mirroring the backend's own lock
 * (`bumpVersionForLineWrite`) rather than only discovering it from a failed
 * request.
 */
export function WorkOrderLines({
  workOrder,
}: {
  readonly workOrder: WorkOrderDetail;
}) {
  const reorder = useReorderWorkOrderLines(workOrder.id);
  const draggedIdRef = useRef<string | null>(null);
  // Deliberately not `isTerminalStatus` — that answers "can this status
  // transition to anything else", which is false for `CANCELLED` but *true*
  // for `COMPLETED` (it can still revert to `IN_PROGRESS`). The backend's own
  // line lock (`bumpVersionForLineWrite`'s `status: { notIn: [...] }` guard)
  // is this exact pair, not "terminal" — matching it precisely here rather
  // than reusing a same-shaped but differently-meant helper.
  const locked =
    workOrder.status === 'COMPLETED' || workOrder.status === 'CANCELLED';
  const lines = workOrder.lines;

  function commitOrder(nextLineIds: readonly string[]): void {
    reorder.mutate(
      { lineIds: [...nextLineIds] },
      {
        onError: (error) => {
          notifyError(error);
        },
      },
    );
  }

  function moveLine(index: number, direction: -1 | 1): void {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= lines.length) {
      return;
    }
    const next = [...lines];
    const [moved] = next.splice(index, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(targetIndex, 0, moved);
    commitOrder(next.map((line) => line.id));
  }

  function handleDrop(
    targetLineId: string,
    event: DragEvent<HTMLLIElement>,
  ): void {
    event.preventDefault();
    const draggedId =
      event.dataTransfer.getData('text/plain') || draggedIdRef.current;
    draggedIdRef.current = null;
    if (draggedId === null || draggedId === '' || draggedId === targetLineId) {
      return;
    }
    const fromIndex = lines.findIndex((line) => line.id === draggedId);
    const toIndex = lines.findIndex((line) => line.id === targetLineId);
    if (fromIndex === -1 || toIndex === -1) {
      return;
    }
    const next = [...lines];
    const [moved] = next.splice(fromIndex, 1);
    if (moved === undefined) {
      return;
    }
    next.splice(toIndex, 0, moved);
    commitOrder(next.map((line) => line.id));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-medium">Rader</h2>
        {locked ? (
          <p className="text-xs text-muted-foreground">
            Arbetsordern är låst och rader kan inte längre ändras.
          </p>
        ) : (
          <AddWorkOrderLineDialog workOrderId={workOrder.id} />
        )}
      </div>

      {lines.length === 0 ? (
        <EmptyState
          icon={ListIcon}
          message="Inga rader ännu. Lägg till den första."
        />
      ) : (
        <ul className="flex flex-col">
          {lines.map((line, index) => (
            <WorkOrderLineRow
              key={line.id}
              workOrderId={workOrder.id}
              line={line}
              index={index}
              lineCount={lines.length}
              locked={locked}
              reorderDisabled={reorder.isPending}
              onMove={moveLine}
              onDragStart={(event) => {
                draggedIdRef.current = line.id;
                event.dataTransfer.setData('text/plain', line.id);
                event.dataTransfer.effectAllowed = 'move';
              }}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => {
                handleDrop(line.id, event);
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
