'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, SearchIcon } from 'lucide-react';
import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  UNITS,
  UNIT_LABELS,
  VAT_RATE_BPS_STANDARD,
  createWorkOrderLineInputSchema,
  ore,
  type Article,
  type CreateWorkOrderLineInput,
  type Ore,
  type WorkOrderLineType,
} from 'shared';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import {
  FormField,
  type FormFieldControlProps,
} from '@/components/form/form-field';
import { MoneyInput } from '@/components/form/money-input';
import { QuantityInput } from '@/components/form/quantity-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useArticles } from '@/lib/api/articles';
import { useAddWorkOrderLine } from '@/lib/api/work-orders';
import { formatQuantity } from '@/lib/format/quantity';

const SEARCH_DEBOUNCE_MS = 250;
const VAT_RATE_OPTIONS = [2500, 1200, 600, 0] as const;

const LINE_TYPE_OPTIONS: readonly {
  readonly value: WorkOrderLineType;
  readonly label: string;
}[] = [
  { value: 'PART', label: 'Reservdel' },
  { value: 'LABOUR', label: 'Arbete' },
  { value: 'FEE', label: 'Avgift' },
];

function vatRateLabel(bps: number): string {
  return `${String(bps / 100)} %`;
}

function defaultValues(): CreateWorkOrderLineInput {
  return {
    type: 'PART',
    description: '',
    quantity: '1',
    unit: 'PIECE',
    unitPriceOre: ore(0),
    vatRateBps: VAT_RATE_BPS_STANDARD,
  };
}

/**
 * F9.3.2 — a debounced search over active articles, showing the stock
 * balance in every result so a mechanic sees a shortage before committing
 * to it. Purely a convenience filler for the fields below: picking a result
 * fills description, unit, price, VAT and `articleId`, but every one of
 * those stays editable afterwards, the same way `line.service.ts` snapshots
 * whatever is actually submitted rather than re-reading the article.
 */
function ArticlePicker({
  hasSelection,
  onSelect,
}: {
  readonly hasSelection: boolean;
  readonly onSelect: (article: Article) => void;
}) {
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(input.trim());
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [input]);

  const searchQuery = useArticles(
    { q: query, isActive: true, limit: 8 },
    { enabled: query !== '' },
  );
  const results = searchQuery.data?.data ?? [];

  return (
    <div className="flex flex-col gap-2 rounded-sharp border border-border p-3">
      <p className="text-xs font-medium text-muted-foreground">
        Sök artikel för att fylla i fälten nedan
      </p>
      <div className="relative">
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={input}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            setInput(event.currentTarget.value);
          }}
          placeholder="Sök på namn, artikelnummer eller OE-nummer"
          aria-label="Sök artikel"
          className="pl-9"
        />
      </div>
      {query === '' ? (
        hasSelection ? (
          <p className="text-xs text-muted-foreground">
            En artikel är vald. Sök igen för att byta.
          </p>
        ) : null
      ) : (
        <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
          {results.map((article: Article) => (
            <button
              key={article.id}
              type="button"
              onClick={() => {
                onSelect(article);
                setInput('');
                setQuery('');
              }}
              className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-sharp px-2 text-left hover:bg-accent focus-visible:bg-accent"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium">
                  {article.name}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {article.sku}
                </span>
              </span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {formatQuantity(article.stockQuantity, article.unit)} i lager
              </span>
            </button>
          ))}
          {results.length === 0 ? (
            <p className="px-2 py-2 text-sm text-muted-foreground">
              Ingen artikel matchar sökningen.
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}

/** F9.3.1 — adding a line: article search, free text, or labour. */
export function AddWorkOrderLineDialog({
  workOrderId,
}: {
  readonly workOrderId: string;
}) {
  const [open, setOpen] = useState(false);
  const addLine = useAddWorkOrderLine(workOrderId);

  const form = useForm<CreateWorkOrderLineInput>({
    resolver: zodResolver(createWorkOrderLineInputSchema),
    defaultValues: defaultValues(),
  });
  const type = useWatch({ control: form.control, name: 'type' });
  const articleId = useWatch({ control: form.control, name: 'articleId' });
  const unit = useWatch({ control: form.control, name: 'unit' });

  function handleTypeChange(nextType: WorkOrderLineType): void {
    form.setValue('type', nextType);
    form.setValue('articleId', undefined);
    form.setValue('unit', nextType === 'LABOUR' ? 'HOUR' : 'PIECE');
  }

  function selectArticle(article: Article): void {
    form.setValue('articleId', article.id);
    form.setValue('description', article.name);
    form.setValue('unit', article.unit);
    form.setValue('unitPriceOre', article.salesPriceOre);
    form.setValue('vatRateBps', article.vatRateBps);
  }

  async function submit(input: CreateWorkOrderLineInput): Promise<void> {
    try {
      await addLine.mutateAsync(input);
      notifySuccess('Raden är tillagd.');
      setOpen(false);
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        form.reset(defaultValues());
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary">
          <PlusIcon aria-hidden="true" />
          Lägg till rad
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Lägg till rad</DialogTitle>
          <DialogDescription>Priser anges exklusive moms.</DialogDescription>
        </DialogHeader>

        <form
          className="flex min-h-0 flex-1 flex-col gap-4"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            void form.handleSubmit(submit)(event);
          }}
        >
          <DialogBody>
          <FormField control={form.control} name="type" label="Typ" required>
            {({
              aria,
            }: FormFieldControlProps<CreateWorkOrderLineInput, 'type'>) => (
              <Select
                value={type}
                onValueChange={(next: string) => {
                  const option = LINE_TYPE_OPTIONS.find(
                    (candidate) => candidate.value === next,
                  );
                  if (option !== undefined) {
                    handleTypeChange(option.value);
                  }
                }}
              >
                <SelectTrigger {...aria} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LINE_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          {type === 'PART' ? (
            <ArticlePicker
              hasSelection={articleId !== undefined}
              onSelect={selectArticle}
            />
          ) : null}

          <FormField
            control={form.control}
            name="description"
            label="Beskrivning"
            required
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<
              CreateWorkOrderLineInput,
              'description'
            >) => <Input {...aria} {...field} />}
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="quantity"
              label="Antal"
              required
            >
              {({
                field,
                aria,
              }: FormFieldControlProps<
                CreateWorkOrderLineInput,
                'quantity'
              >) => (
                <QuantityInput
                  {...aria}
                  value={field.value}
                  onChange={(value: string | null) => {
                    field.onChange(value ?? '0');
                  }}
                  onBlur={field.onBlur}
                  unit={unit}
                />
              )}
            </FormField>

            <FormField
              control={form.control}
              name="unit"
              label="Enhet"
              required
            >
              {({
                field,
                aria,
              }: FormFieldControlProps<CreateWorkOrderLineInput, 'unit'>) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger {...aria} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map((unit) => (
                      <SelectItem key={unit} value={unit}>
                        {UNIT_LABELS[unit]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>

            <FormField
              control={form.control}
              name="unitPriceOre"
              label="Á-pris (exkl. moms)"
              required
            >
              {({
                field,
                aria,
              }: FormFieldControlProps<
                CreateWorkOrderLineInput,
                'unitPriceOre'
              >) => (
                <MoneyInput
                  {...aria}
                  value={ore(field.value)}
                  onChange={(value: Ore | null) => {
                    field.onChange(value ?? ore(0));
                  }}
                  onBlur={field.onBlur}
                />
              )}
            </FormField>

            <FormField
              control={form.control}
              name="vatRateBps"
              label="Momssats"
              required
            >
              {({
                field,
                aria,
              }: FormFieldControlProps<
                CreateWorkOrderLineInput,
                'vatRateBps'
              >) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(next: string) => {
                    field.onChange(Number(next));
                  }}
                >
                  <SelectTrigger {...aria} className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VAT_RATE_OPTIONS.map((bps) => (
                      <SelectItem key={bps} value={String(bps)}>
                        {vatRateLabel(bps)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </FormField>
          </div>
          </DialogBody>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
                form.reset(defaultValues());
              }}
            >
              Avbryt
            </Button>
            <Button type="submit" isPending={addLine.isPending}>
              Lägg till rad
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
