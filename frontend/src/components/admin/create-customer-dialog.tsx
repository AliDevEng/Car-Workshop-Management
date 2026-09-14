'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import {
  CUSTOMER_TYPE_LABELS,
  CUSTOMER_TYPES,
  createCustomerInputSchema,
  type CreateCustomerInput,
} from 'shared';
import { FormField } from '@/components/form/form-field';
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
import { useCreateCustomer } from '@/lib/api/customers';

const DEFAULT_VALUES: CreateCustomerInput = {
  type: 'PRIVATE',
  name: '',
  phone: '',
};

/** Normalises a cleared optional text field to `undefined`, not `''`. */
function orUndefined(value: string): string | undefined {
  return value === '' ? undefined : value;
}

/** F6.1.3 — "Ny kund", a dialog rather than a page: this is a five-field form. */
export function CreateCustomerDialog({
  trigger,
}: {
  readonly trigger?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const createCustomer = useCreateCustomer();
  const form = useForm<CreateCustomerInput>({
    resolver: zodResolver(createCustomerInputSchema),
    defaultValues: DEFAULT_VALUES,
  });
  // `useWatch`, not `form.watch()`: the latter is a plain function call the
  // React Compiler cannot memoise safely, which fails `pnpm lint`'s
  // zero-warnings gate on this exact line.
  const type = useWatch({ control: form.control, name: 'type' });

  async function submit(input: CreateCustomerInput): Promise<void> {
    try {
      const created = await createCustomer.mutateAsync(input);
      notifySuccess(`${created.name} har lagts till.`);
      setOpen(false);
      form.reset(DEFAULT_VALUES);
      router.push(`/admin/kunder/${created.id}`);
    } catch (error) {
      notifyError(error);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          form.reset(DEFAULT_VALUES);
        }
      }}
    >
      <DialogTrigger asChild>
        {trigger ?? (
          <Button type="button">
            <PlusIcon aria-hidden="true" />
            Ny kund
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ny kund</DialogTitle>
          <DialogDescription>
            Endast namn och telefonnummer krävs. Resten går att fylla i senare.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void form.handleSubmit(submit)(event);
          }}
        >
          <FormField control={form.control} name="type" label="Typ" required>
            {({ field, aria }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id={aria.id} className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CUSTOMER_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {CUSTOMER_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </FormField>

          <FormField control={form.control} name="name" label="Namn" required>
            {({ field, aria }) => (
              <Input {...aria} {...field} autoComplete="name" />
            )}
          </FormField>

          <FormField
            control={form.control}
            name="phone"
            label="Telefon"
            required
            description="Så kunden skrev det, t.ex. 070-123 45 67."
          >
            {({ field, aria }) => (
              <Input {...aria} {...field} type="tel" autoComplete="tel" />
            )}
          </FormField>

          <FormField control={form.control} name="email" label="E-post">
            {({ field, aria }) => (
              <Input
                {...aria}
                type="email"
                autoComplete="email"
                value={field.value ?? ''}
                onChange={(event) => {
                  field.onChange(orUndefined(event.target.value));
                }}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          {type === 'COMPANY' ? (
            <FormField
              control={form.control}
              name="orgNumber"
              label="Organisationsnummer"
              description="T.ex. 556677-8899."
            >
              {({ field, aria }) => (
                <Input
                  {...aria}
                  value={field.value ?? ''}
                  onChange={(event) => {
                    field.onChange(orUndefined(event.target.value));
                  }}
                  onBlur={field.onBlur}
                />
              )}
            </FormField>
          ) : null}

          <FormField control={form.control} name="address" label="Adress">
            {({ field, aria }) => (
              <Input
                {...aria}
                autoComplete="street-address"
                value={field.value ?? ''}
                onChange={(event) => {
                  field.onChange(orUndefined(event.target.value));
                }}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          <FormField control={form.control} name="notes" label="Anteckningar">
            {({ field, aria }) => (
              <Textarea
                {...aria}
                value={field.value ?? ''}
                onChange={(event) => {
                  field.onChange(orUndefined(event.target.value));
                }}
                onBlur={field.onBlur}
              />
            )}
          </FormField>

          <DialogFooter>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setOpen(false);
              }}
            >
              Avbryt
            </Button>
            <Button type="submit" isPending={form.formState.isSubmitting}>
              Skapa kund
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
