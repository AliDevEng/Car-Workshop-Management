'use client';

import { useState, type ChangeEvent } from 'react';
import {
  CHECKLIST_RESULTS,
  CHECKLIST_RESULT_LABELS,
  SERVICE_TYPE_LABELS,
  type ChecklistAnswer,
  type ChecklistResult,
  type ChecklistTemplate,
  type CreateServiceProtocolInput,
} from 'shared';
import { DatePicker } from '@/components/form/date-picker';
import { OdometerInput } from '@/components/form/odometer-input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  useChecklistTemplate,
  useChecklistTemplates,
} from '@/lib/api/checklist-templates';
import { cn } from '@/lib/utils';

/**
 * Radix Select needs a defined `value` at all times or React treats the
 * control as switching between controlled and uncontrolled — the same
 * reason `WorkOrderDetailPage`'s mechanic picker uses an `UNASSIGNED`
 * sentinel rather than `undefined` for "nothing chosen yet".
 */
const NO_TEMPLATE = '__no-template__';

interface ChecklistDraftItem {
  readonly key: string;
  readonly label: string;
  readonly result: ChecklistResult | null;
  readonly note: string;
}

function seedChecklist(
  items: readonly { readonly key: string; readonly label: string }[],
  previous: readonly ChecklistAnswer[] | undefined,
): ChecklistDraftItem[] {
  const byKey = new Map((previous ?? []).map((answer) => [answer.key, answer]));
  return items.map((item) => {
    const answer = byKey.get(item.key);
    return {
      key: item.key,
      label: item.label,
      result: answer?.result ?? null,
      note: answer?.note ?? '',
    };
  });
}

/**
 * F10.3.3 — every item must be answered, with unanswered items highlighted.
 * The only point the backend accepts a checklist at all is a full one
 * (`createServiceProtocolInputSchema` requires a `result` per item, and
 * there is no server-side "unanswered" state) — so this is where that rule
 * is enforced, on the form that produces the record, and again as a guard
 * right before `onSubmit` fires.
 */
function ChecklistItemRow({
  item,
  onChange,
}: {
  readonly item: ChecklistDraftItem;
  readonly onChange: (next: ChecklistDraftItem) => void;
}) {
  const unanswered = item.result === null;
  return (
    <div
      role="group"
      aria-label={item.label}
      className={cn(
        'flex flex-col gap-2 rounded-sharp border p-3',
        unanswered ? 'border-destructive' : 'border-border',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{item.label}</span>
        {unanswered ? (
          <span className="text-xs text-destructive">Obesvarad</span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {CHECKLIST_RESULTS.map((result) => (
          <Button
            key={result}
            type="button"
            size="sm"
            variant={item.result === result ? 'primary' : 'outline'}
            aria-pressed={item.result === result}
            onClick={() => {
              onChange({ ...item, result });
            }}
          >
            {CHECKLIST_RESULT_LABELS[result]}
          </Button>
        ))}
      </div>
      <Textarea
        aria-label={`Anteckning för ${item.label}`}
        placeholder="Anteckning (valfritt)"
        value={item.note}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
          onChange({ ...item, note: event.currentTarget.value });
        }}
      />
    </div>
  );
}

/**
 * F10.3 — creation, and its correction counterpart (§6.7): pick a checklist
 * template, answer every item, and record the odometer and the next service.
 * Also reused, in a slightly different shell, by the pre-finalisation editor
 * on the protocol detail page.
 */
export function ServiceProtocolForm({
  initialTemplateId = null,
  initialChecklist,
  initialOdometerKm,
  initialNextServiceDueKm = null,
  initialNextServiceDueDate = '',
  initialNotes = '',
  submitLabel,
  isPending,
  onSubmit,
  onCancel,
}: {
  readonly initialTemplateId?: string | null;
  readonly initialChecklist?: readonly ChecklistAnswer[];
  readonly initialOdometerKm: number | null;
  readonly initialNextServiceDueKm?: number | null;
  readonly initialNextServiceDueDate?: string;
  readonly initialNotes?: string;
  readonly submitLabel: string;
  readonly isPending: boolean;
  readonly onSubmit: (input: CreateServiceProtocolInput) => void;
  readonly onCancel?: () => void;
}) {
  const [templateId, setTemplateId] = useState<string | null>(
    initialTemplateId,
  );
  const [checklist, setChecklist] = useState<ChecklistDraftItem[]>([]);
  const [odometerKm, setOdometerKm] = useState<number | null>(
    initialOdometerKm,
  );
  const [nextServiceDueKm, setNextServiceDueKm] = useState<number | null>(
    initialNextServiceDueKm,
  );
  const [nextServiceDueDate, setNextServiceDueDate] = useState(
    initialNextServiceDueDate,
  );
  const [notes, setNotes] = useState(initialNotes);
  const [attempted, setAttempted] = useState(false);
  // The template a checklist was last seeded from, so a parent re-render
  // that hands in a new `initialChecklist` array (same content, new
  // reference) cannot re-seed the form under an editing user — only an
  // actual template change does.
  const [seededTemplateId, setSeededTemplateId] = useState<string | null>(null);

  const templatesQuery = useChecklistTemplates({ isActive: true, limit: 100 });
  const templateQuery = useChecklistTemplate(templateId);

  // Seeds the checklist from the selected template's items, carrying over
  // any answer that already exists for a matching key — which is how a
  // correction opens with the original's answers pre-filled rather than
  // blank. Adjusted during render rather than in an effect, the same
  // pattern `ConvertingInput` uses for "a value arriving from outside
  // replaces local state": comparing against the last-seeded template id is
  // what makes this run only once per template choice rather than on every
  // render.
  if (
    templateQuery.data !== undefined &&
    templateQuery.data.id !== seededTemplateId
  ) {
    const template = templateQuery.data;
    setSeededTemplateId(template.id);
    setChecklist(
      seedChecklist(
        template.items,
        template.id === initialTemplateId ? initialChecklist : undefined,
      ),
    );
  }

  const unansweredCount = checklist.filter(
    (item) => item.result === null,
  ).length;
  const canSubmit =
    templateId !== null &&
    checklist.length > 0 &&
    unansweredCount === 0 &&
    odometerKm !== null;

  function handleSubmit(): void {
    setAttempted(true);
    if (!canSubmit || templateId === null || odometerKm === null) {
      return;
    }
    const input: CreateServiceProtocolInput = {
      checklistTemplateId: templateId,
      odometerKm,
      checklist: checklist.map((item) => ({
        key: item.key,
        label: item.label,
        result: item.result ?? 'NOT_APPLICABLE',
        ...(item.note.trim() === '' ? {} : { note: item.note.trim() }),
      })),
      ...(nextServiceDueKm === null ? {} : { nextServiceDueKm }),
      ...(nextServiceDueDate === '' ? {} : { nextServiceDueDate }),
      ...(notes.trim() === '' ? {} : { notes: notes.trim() }),
    };
    onSubmit(input);
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="rounded-soft">
        <CardHeader>
          <CardTitle>Checklistmall</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Field>
            <FieldLabel htmlFor="protocol-template">Checklistmall</FieldLabel>
            <Select
              value={templateId ?? NO_TEMPLATE}
              onValueChange={(next: string) => {
                setTemplateId(next === NO_TEMPLATE ? null : next);
              }}
            >
              <SelectTrigger id="protocol-template" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_TEMPLATE} disabled>
                  Välj checklistmall
                </SelectItem>
                {templatesQuery.data?.data.map(
                  (template: ChecklistTemplate) => (
                    <SelectItem key={template.id} value={template.id}>
                      {template.name} (
                      {SERVICE_TYPE_LABELS[template.serviceType]})
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </Field>

          <Field>
            <FieldLabel htmlFor="protocol-odometer">Mätarställning</FieldLabel>
            <OdometerInput
              id="protocol-odometer"
              value={odometerKm}
              onChange={setOdometerKm}
            />
            {attempted && odometerKm === null ? (
              <p role="alert" className="text-sm text-destructive">
                Ange mätarställningen.
              </p>
            ) : null}
          </Field>
        </CardContent>
      </Card>

      {templateId === null ? null : (
        <Card className="rounded-soft">
          <CardHeader>
            <CardTitle>Checklista</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {templateQuery.isPending ? (
              <p className="text-sm text-muted-foreground">
                Laddar checklista …
              </p>
            ) : (
              checklist.map((item) => (
                <ChecklistItemRow
                  key={item.key}
                  item={item}
                  onChange={(next) => {
                    setChecklist((current) =>
                      current.map((existing) =>
                        existing.key === next.key ? next : existing,
                      ),
                    );
                  }}
                />
              ))
            )}
            {attempted && unansweredCount > 0 ? (
              <p role="alert" className="text-sm text-destructive">
                {unansweredCount} punkt{unansweredCount === 1 ? '' : 'er'}{' '}
                saknar svar.
              </p>
            ) : null}
          </CardContent>
        </Card>
      )}

      <Card className="rounded-soft">
        <CardHeader>
          <CardTitle>Nästa service</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="protocol-next-km">
              Vid mätarställning
            </FieldLabel>
            <OdometerInput
              id="protocol-next-km"
              value={nextServiceDueKm}
              onChange={setNextServiceDueKm}
              optional
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="protocol-next-date">Senast datum</FieldLabel>
            <DatePicker
              id="protocol-next-date"
              value={nextServiceDueDate === '' ? null : nextServiceDueDate}
              onChange={(value) => {
                setNextServiceDueDate(value ?? '');
              }}
              optional
              disablePast={false}
            />
          </Field>
        </CardContent>
      </Card>

      <Card className="rounded-soft">
        <CardHeader>
          <CardTitle>Anteckningar</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            aria-label="Anteckningar"
            value={notes}
            onChange={(event: ChangeEvent<HTMLTextAreaElement>) => {
              setNotes(event.currentTarget.value);
            }}
            placeholder="Fritextanteckningar till protokollet"
          />
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        {onCancel === undefined ? null : (
          <Button type="button" variant="secondary" onClick={onCancel}>
            Avbryt
          </Button>
        )}
        <Button type="button" isPending={isPending} onClick={handleSubmit}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}
