'use client';

import { useId, type ReactNode } from 'react';
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from 'react-hook-form';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from '@/components/ui/field';

/**
 * What a control receives from {@link FormField}.
 *
 * `aria` is spread onto the input rather than left to each caller: F1.3.3
 * requires every error to be tied to its input with `aria-describedby`, and
 * a rule that each component must remember is a rule that will be forgotten
 * on the twentieth form. Here it is impossible to get wrong, because the
 * wrapper owns the ids.
 */
export interface FormFieldControlProps<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
> {
  readonly field: ControllerRenderProps<Values, Name>;
  readonly aria: {
    readonly id: string;
    readonly 'aria-describedby': string | undefined;
    readonly 'aria-invalid': boolean | undefined;
    readonly 'aria-required': boolean | undefined;
  };
}

export interface FormFieldProps<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
> {
  readonly control: Control<Values>;
  readonly name: Name;
  readonly label: string;
  /** Shown under the label. Also announced, via `aria-describedby`. */
  readonly description?: string;
  readonly required?: boolean;
  readonly children: (props: FormFieldControlProps<Values, Name>) => ReactNode;
}

/**
 * The project's form field (F1.3.2).
 *
 * Wraps React Hook Form's `Controller` — rather than `register` — because
 * every conversion input in F1.3 is a controlled component that transforms
 * its value (kronor to öre, mil to km), and `register` hands back a raw DOM
 * event. `Controller` is what lets `field.onChange` receive a domain value.
 *
 * The Swedish error text comes from the resolver, which means it comes from
 * the `shared` Zod schema — one message, used by the API and the form, so
 * the two cannot disagree about what is wrong (F1.3.1).
 */
export function FormField<
  Values extends FieldValues,
  Name extends FieldPath<Values>,
>({
  control,
  name,
  label,
  description,
  required = false,
  children,
}: FormFieldProps<Values, Name>) {
  const generatedId = useId();
  const controlId = `${generatedId}-control`;
  const descriptionId = `${generatedId}-description`;
  const errorId = `${generatedId}-error`;

  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const invalid = fieldState.error !== undefined;
        // Order matters to a screen reader: the description explains the
        // field, the error says what to fix.
        const describedBy =
          [
            description === undefined ? undefined : descriptionId,
            invalid ? errorId : undefined,
          ]
            .filter((value) => value !== undefined)
            .join(' ') || undefined;

        return (
          <Field data-invalid={invalid ? 'true' : undefined}>
            <FieldLabel htmlFor={controlId} className="text-sm font-medium">
              {label}
              {required ? (
                <>
                  {/*
                   * The asterisk is decorative — `aria-required` on the
                   * control is what actually announces this. A screen reader
                   * reading "star" after every label is noise.
                   */}
                  <span aria-hidden="true" className="text-destructive">
                    *
                  </span>
                  <span className="sr-only">(obligatoriskt)</span>
                </>
              ) : null}
            </FieldLabel>

            {description === undefined ? null : (
              <FieldDescription id={descriptionId}>
                {description}
              </FieldDescription>
            )}

            {children({
              field,
              aria: {
                id: controlId,
                'aria-describedby': describedBy,
                'aria-invalid': invalid ? true : undefined,
                'aria-required': required ? true : undefined,
              },
            })}

            {invalid ? (
              <FieldError id={errorId}>{fieldState.error?.message}</FieldError>
            ) : null}
          </Field>
        );
      }}
    />
  );
}
