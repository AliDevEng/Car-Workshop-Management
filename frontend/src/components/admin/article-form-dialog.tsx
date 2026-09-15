'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import type { z } from 'zod';
import {
  UNITS,
  UNIT_LABELS,
  VAT_RATE_BPS_STANDARD,
  createArticleInputSchema,
  ore,
  type Article,
  type CreateArticleInput,
  type Ore,
} from 'shared';
import { FormField, type FormFieldControlProps } from '@/components/form/form-field';
import { MoneyInput } from '@/components/form/money-input';
import { QuantityInput } from '@/components/form/quantity-input';
import { TagInput } from '@/components/form/tag-input';
import { notifyError, notifySuccess } from '@/components/admin/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
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
import { Textarea } from '@/components/ui/textarea';
import { useCreateArticle, useUpdateArticle } from '@/lib/api/articles';

/**
 * `createArticleInputSchema` defaults three fields (`vatRateBps`,
 * `minimumQuantity`, `oeNumbers`), so its `z.input` (what the resolver reads
 * the raw field values as) and `z.output`/`CreateArticleInput` (what it
 * produces after applying those defaults) genuinely differ — unlike every
 * other schema-backed form in this codebase, which has no defaulted fields
 * and so never notices the distinction. `useForm`'s third generic is exactly
 * this: field values in, `CreateArticleInput` out of `handleSubmit`.
 */
type ArticleFormValues = z.input<typeof createArticleInputSchema>;

/** The Swedish VAT rates a workshop actually invoices at, in basis points. */
const VAT_RATE_OPTIONS = [2500, 1200, 600, 0] as const;

function vatRateLabel(bps: number): string {
  return `${String(bps / 100)} %`;
}

function defaultValues(article: Article | undefined): CreateArticleInput {
  if (article === undefined) {
    return {
      sku: '',
      name: '',
      unit: 'PIECE',
      salesPriceOre: ore(0),
      vatRateBps: VAT_RATE_BPS_STANDARD,
      minimumQuantity: '0',
      oeNumbers: [],
    };
  }
  return {
    sku: article.sku,
    name: article.name,
    ...(article.description === null ? {} : { description: article.description }),
    unit: article.unit,
    salesPriceOre: article.salesPriceOre,
    ...(article.purchasePriceOre === null
      ? {}
      : { purchasePriceOre: article.purchasePriceOre }),
    vatRateBps: article.vatRateBps,
    minimumQuantity: article.minimumQuantity,
    ...(article.location === null ? {} : { location: article.location }),
    oeNumbers: article.oeNumbers,
  };
}

/**
 * The F7.2 full form, shared between creating and editing an article.
 *
 * One schema and one set of fields for both modes rather than a create
 * dialog plus a set of `InlineField`s the way F6 edits a customer: a price is
 * a `MoneyInput` and a minimum quantity a `QuantityInput`, and `InlineField`
 * only drives a plain `<Input>`. Splitting the two conversion-aware fields
 * out into inline editors while the rest stayed a full form would be the
 * worse inconsistency.
 *
 * `isAdmin` disables and explains the money fields rather than hiding them
 * (F7.2.4): the same rule the backend enforces in `updateArticle`'s
 * `assertMayChangePrices`, so a mechanic sees exactly the boundary the API
 * will also refuse, not a different one.
 */
export function ArticleFormDialog({
  mode,
  isAdmin,
  trigger,
}: {
  readonly mode: { readonly kind: 'create' } | { readonly kind: 'edit'; readonly article: Article };
  readonly isAdmin: boolean;
  readonly trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const existing = mode.kind === 'edit' ? mode.article : undefined;
  const createArticle = useCreateArticle();
  const updateArticle = useUpdateArticle(existing?.id ?? '');
  const isPending =
    mode.kind === 'create' ? createArticle.isPending : updateArticle.isPending;

  const form = useForm<ArticleFormValues, unknown, CreateArticleInput>({
    resolver: zodResolver(createArticleInputSchema),
    defaultValues: defaultValues(existing),
  });
  // `useWatch`, not `form.watch()`: the latter returns a plain function call
  // result that cannot be memoized, which the React Compiler flags and the
  // root `pnpm lint` gate (`--max-warnings 0`) then fails on.
  const selectedUnit = useWatch({ control: form.control, name: 'unit' });

  function resetToCurrent(): void {
    form.reset(defaultValues(existing));
  }

  async function submit(input: CreateArticleInput): Promise<void> {
    try {
      if (mode.kind === 'create') {
        const created = await createArticle.mutateAsync(input);
        notifySuccess(`${created.name} har lagts till i lagret.`);
        setOpen(false);
        router.push(`/admin/lager/${created.id}`);
        return;
      }
      await updateArticle.mutateAsync(input);
      notifySuccess('Artikeln är sparad.');
      setOpen(false);
    } catch (error) {
      notifyError(error);
    }
  }

  const priceFieldsDisabled = !isAdmin;
  // `exactOptionalPropertyTypes` refuses `description: undefined` outright —
  // the prop must be absent, not present-and-undefined — so these are spread
  // rather than passed directly (CLAUDE.md's stated caveat for the flag).
  const priceFieldDescriptionProp = priceFieldsDisabled
    ? { description: 'Endast administratörer får ändra priser.' }
    : {};
  const vatFieldDescriptionProp = priceFieldsDisabled
    ? { description: 'Endast administratörer får ändra momssats.' }
    : {};

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen: boolean) => {
        setOpen(nextOpen);
        // On every transition, not only on close: this dialog stays mounted
        // for the whole time its page is open, so a background refetch of
        // `article` while it is closed (a stale-time refresh, another tab's
        // edit) would otherwise only reach the form the *next* time it
        // closes, one open cycle too late. Resetting on open too means it
        // always shows what the server has right now.
        resetToCurrent();
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <PlusIcon aria-hidden="true" />
            Ny artikel
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode.kind === 'create' ? 'Ny artikel' : 'Redigera artikel'}
          </DialogTitle>
          <DialogDescription>
            Priser anges exklusive moms. Momssats och pris kan bara ändras av
            administratörer.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto pr-1"
          onSubmit={(event: FormEvent<HTMLFormElement>) => {
            void form.handleSubmit(submit)(event);
          }}
        >
          <FormField control={form.control} name="sku" label="Artikelnummer" required>
            {({ field, aria }: FormFieldControlProps<ArticleFormValues, 'sku'>) => (
              <Input {...aria} {...field} />
            )}
          </FormField>

          <FormField control={form.control} name="name" label="Namn" required>
            {({ field, aria }: FormFieldControlProps<ArticleFormValues, 'name'>) => (
              <Input {...aria} {...field} />
            )}
          </FormField>

          <FormField control={form.control} name="description" label="Beskrivning">
            {({
              field,
              aria,
            }: FormFieldControlProps<ArticleFormValues, 'description'>) => (
              <Textarea
                {...aria}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          <FormField control={form.control} name="unit" label="Enhet" required>
            {({ field, aria }: FormFieldControlProps<ArticleFormValues, 'unit'>) => (
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
            name="salesPriceOre"
            label="Försäljningspris (exkl. moms)"
            required
            {...priceFieldDescriptionProp}
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<ArticleFormValues, 'salesPriceOre'>) => (
              <MoneyInput
                {...aria}
                value={ore(field.value)}
                onChange={(value: Ore | null) => {
                  // Never written as `null`: the field is required, and
                  // `RecordOdometerReadingDialog` sets the same precedent for
                  // a required conversion input — a momentarily empty field
                  // falls back to a concrete default rather than a value the
                  // schema (a plain `number`, not `number | null`) would
                  // reject with a generic, unlocalised Zod message on top of
                  // `ConvertingInput`'s own Swedish one.
                  field.onChange(value ?? ore(0));
                }}
                onBlur={field.onBlur}
                disabled={priceFieldsDisabled}
              />
            )}
          </FormField>

          <FormField
            control={form.control}
            name="purchasePriceOre"
            label="Inköpspris (exkl. moms)"
            {...priceFieldDescriptionProp}
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<ArticleFormValues, 'purchasePriceOre'>) => (
              <MoneyInput
                {...aria}
                value={field.value === undefined ? null : ore(field.value)}
                onChange={(value: Ore | null) => {
                  // `undefined`, not `null`: the schema field is optional
                  // (`Ore | undefined`), and `null` is a different value that
                  // `.optional()` does not accept — a cleared field must
                  // become "not set", not a value the resolver rejects.
                  field.onChange(value ?? undefined);
                }}
                onBlur={field.onBlur}
                optional
                disabled={priceFieldsDisabled}
              />
            )}
          </FormField>

          <FormField
            control={form.control}
            name="vatRateBps"
            label="Momssats"
            required
            {...vatFieldDescriptionProp}
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<ArticleFormValues, 'vatRateBps'>) => (
              <Select
                value={String(field.value)}
                onValueChange={(next: string) => {
                  field.onChange(Number(next));
                }}
                disabled={priceFieldsDisabled}
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

          <FormField
            control={form.control}
            name="minimumQuantity"
            label="Minsta saldo"
            required
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<ArticleFormValues, 'minimumQuantity'>) => (
              <QuantityInput
                {...aria}
                value={field.value ?? null}
                onChange={(value: string | null) => {
                  field.onChange(value ?? '0');
                }}
                onBlur={field.onBlur}
                unit={selectedUnit}
              />
            )}
          </FormField>

          <FormField control={form.control} name="location" label="Hyllplats">
            {({ field, aria }: FormFieldControlProps<ArticleFormValues, 'location'>) => (
              <Input {...aria} value={field.value ?? ''} onChange={field.onChange} onBlur={field.onBlur} />
            )}
          </FormField>

          <FormField
            control={form.control}
            name="oeNumbers"
            label="OE-nummer"
            description="Tryck Enter eller komma för att lägga till."
          >
            {({
              field,
              aria,
            }: FormFieldControlProps<ArticleFormValues, 'oeNumbers'>) => (
              <TagInput
                {...aria}
                value={field.value ?? []}
                onChange={field.onChange}
                onBlur={field.onBlur}
                placeholder="T.ex. 1K0615301AA"
              />
            )}
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                // Not wrapped in `DialogClose`, so it never reaches Radix's
                // own close handling — Escape, the overlay and the built-in
                // × button all fire `onOpenChange` and reset the form there,
                // but a plain button calling `setOpen(false)` directly does
                // not, and would leave an abandoned edit sitting in the form
                // for the next time it opens.
                setOpen(false);
                resetToCurrent();
              }}
            >
              Avbryt
            </Button>
            <Button type="submit" isPending={isPending}>
              {mode.kind === 'create' ? 'Skapa artikel' : 'Spara ändringar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
