'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import { AlertTriangle, Loader2, Phone, RotateCw } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Controller, useForm, type UseFormSetError } from 'react-hook-form';
import {
  REQUESTED_TIME_OF_DAY_LABELS,
  publicBookingRequestInputSchema,
  publicBookingRequestResponseSchema,
  type RequestedTimeOfDay,
} from 'shared';
import { z } from 'zod';
import { DatePicker } from '@/components/form/date-picker';
import { RegNrInput as RegistrationNumberInput } from '@/components/form/reg-nr-input';
import { Input } from '@/components/ui/input';
import { ApiError } from '@/lib/api/errors';
import { apiFetch } from '@/lib/api';
import { type Service } from '@/lib/public/services';
import { usePublicFormToken } from '@/lib/public/use-public-form-token';
import { cn } from '@/lib/utils';

const fieldErrorDetailSchema = z.object({
  path: z.string(),
  message: z.string(),
});

const fieldErrorDetailsSchema = z.array(fieldErrorDetailSchema);
const bookingDetailsSchema = publicBookingRequestInputSchema.omit({
  formToken: true,
});

/** An in-memory draft only; never includes a form token. */
export type BookingFormDraft = {
  website: '';
  regNr?: string;
  customerName: string;
  phone: string;
  email?: string;
  requestedDate?: string;
  requestedTimeOfDay: '' | RequestedTimeOfDay;
  serviceTypeIds: string[];
  message?: string;
};
type BookingFormField = keyof BookingFormDraft;

const visibleFields = [
  { name: 'customerName', suffix: 'customer-name', label: 'Namn' },
  { name: 'phone', suffix: 'phone', label: 'Telefon' },
  { name: 'email', suffix: 'email', label: 'E-post' },
  { name: 'regNr', suffix: 'regnr', label: 'Registreringsnummer' },
  { name: 'requestedDate', suffix: 'date', label: 'Önskad dag' },
  { name: 'requestedTimeOfDay', suffix: 'time', label: 'Tid på dagen' },
  { name: 'serviceTypeIds', suffix: 'services', label: 'Vad gäller ärendet?' },
  { name: 'message', suffix: 'message', label: 'Meddelande' },
] as const satisfies readonly {
  name: BookingFormField;
  suffix: string;
  label: string;
}[];

type FieldErrorLink = {
  readonly id: string;
  readonly label: string;
  readonly message: string;
};

type ErrorVariant = 'general' | 'rate-limit' | 'token' | 'validation';

function revealField(element: HTMLElement | null): void {
  element?.focus({ preventScroll: true });
  element?.scrollIntoView({ block: 'center', behavior: 'instant' });
}

const fieldNames: ReadonlySet<string> = new Set<BookingFormField>([
  'website',
  'regNr',
  'customerName',
  'phone',
  'email',
  'requestedDate',
  'requestedTimeOfDay',
  'serviceTypeIds',
  'message',
]);

type FormStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'submitting' }
  | {
      readonly kind: 'error';
      readonly variant: ErrorVariant;
      readonly message: string;
      readonly requestId?: string;
    };

function optionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

function isBookingFormField(value: string): value is BookingFormField {
  return fieldNames.has(value);
}

function normaliseForSubmit(values: BookingFormDraft) {
  const regNr = optionalText(values.regNr);
  const email = optionalText(values.email);
  const requestedDate = optionalText(values.requestedDate);
  const message = optionalText(values.message);
  const requestedTimeOfDay =
    values.requestedTimeOfDay === '' ? undefined : values.requestedTimeOfDay;

  return {
    website: values.website,
    ...(regNr === undefined ? {} : { regNr }),
    customerName: values.customerName,
    phone: values.phone,
    ...(email === undefined ? {} : { email }),
    ...(requestedDate === undefined ? {} : { requestedDate }),
    ...(requestedTimeOfDay === undefined ? {} : { requestedTimeOfDay }),
    serviceTypeIds: values.serviceTypeIds,
    ...(message === undefined ? {} : { message }),
  };
}

function mapFieldErrors(
  details: unknown,
  setError: UseFormSetError<BookingFormDraft>,
): boolean {
  const parsed = fieldErrorDetailsSchema.safeParse(details);
  if (!parsed.success) {
    return false;
  }

  let mapped = false;
  for (const detail of parsed.data) {
    const path = detail.path.split('.')[0] ?? '';
    if (isBookingFormField(path)) {
      setError(path, { message: detail.message });
      mapped = true;
    }
  }
  return mapped;
}

function hasFormTokenError(details: unknown): boolean {
  const parsed = fieldErrorDetailsSchema.safeParse(details);
  return parsed.success
    ? parsed.data.some((detail) => detail.path === 'formToken')
    : false;
}

function formErrorStatus(
  variant: ErrorVariant,
  message: string,
  requestId: string | undefined,
): FormStatus {
  return requestId === undefined
    ? { kind: 'error', variant, message }
    : { kind: 'error', variant, message, requestId };
}

function getInitialServiceIds(
  services: readonly Service[],
  selectedServiceSlug: string | undefined,
): string[] {
  if (
    selectedServiceSlug === undefined ||
    services.every((service) => service.slug !== selectedServiceSlug)
  ) {
    return [];
  }
  return [selectedServiceSlug];
}

export interface BookingFormProps {
  readonly idPrefix?: string;
  readonly actionsContainer?: HTMLElement | null;
  readonly onSuccess?: () => void;
  readonly onPendingChange?: (pending: boolean) => void;
  readonly initialDraft?: BookingFormDraft;
  readonly onDraftChange?: (draft: BookingFormDraft) => void;
  readonly defaultRegistrationNumber: string;
  readonly selectedServiceSlug: string | undefined;
  readonly services: readonly Service[];
  readonly workshopPhone: string;
  readonly telephoneHref: string;
}

export function BookingForm({
  idPrefix = 'booking',
  actionsContainer,
  onSuccess,
  onPendingChange,
  initialDraft,
  onDraftChange,
  defaultRegistrationNumber,
  selectedServiceSlug,
  services,
  workshopPhone,
  telephoneHref,
}: BookingFormProps) {
  const router = useRouter();
  const token = usePublicFormToken({ purpose: 'booking' });
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });
  const formRef = useRef<HTMLFormElement>(null);

  const {
    control,
    clearErrors,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
    subscribe,
  } = useForm<BookingFormDraft>({
    defaultValues: {
      website: '',
      regNr: defaultRegistrationNumber,
      customerName: '',
      phone: '',
      requestedTimeOfDay: '',
      serviceTypeIds: getInitialServiceIds(services, selectedServiceSlug),
      ...initialDraft,
    },
  });

  useEffect(() => {
    if (onDraftChange === undefined) return;
    return subscribe({
      formState: { values: true },
      callback: ({ values }) => {
        onDraftChange({
          ...values,
          serviceTypeIds: [...values.serviceTypeIds],
        });
      },
    });
  }, [subscribe, onDraftChange]);

  // Run after the errors have rendered, in visual field order. In particular,
  // a schema's regNr-first order must not skip the name at the top of the form.
  useEffect(() => {
    if (status.kind !== 'error') return;
    const form = formRef.current;
    revealField(
      (status.variant === 'validation'
        ? form?.querySelector<HTMLElement>('[aria-invalid="true"]')
        : null) ??
        form?.querySelector<HTMLElement>('[role="alert"]') ??
        null,
    );
  }, [status]);

  async function submit(values: BookingFormDraft) {
    clearErrors();
    // Validate editable fields before requesting/waiting for the anti-spam
    // token, so a service outage cannot hide a missing name or phone number.
    const payload = bookingDetailsSchema.safeParse(normaliseForSubmit(values));
    if (!payload.success) {
      for (const issue of payload.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string' && isBookingFormField(path)) {
          setError(path, {
            message:
              path === 'phone' && values.phone.trim() === ''
                ? 'Ange ditt telefonnummer.'
                : issue.message,
          });
        }
      }
      setStatus({
        kind: 'error',
        variant: 'validation',
        message: 'Kontrollera uppgifterna och försök igen.',
      });
      return;
    }

    setStatus({ kind: 'submitting' });
    onPendingChange?.(true);

    try {
      const formToken = await token.getToken();

      await apiFetch(
        '/public/booking-requests',
        publicBookingRequestResponseSchema,
        {
          method: 'POST',
          body: { ...payload.data, formToken },
        },
      );

      if (onSuccess) {
        onSuccess();
      } else {
        router.push('/boka/tack');
      }
    } catch (error) {
      if (error instanceof ApiError) {
        const tokenError = hasFormTokenError(error.details);
        const mapped = mapFieldErrors(error.details, setError);
        if (error.code === 'RATE_LIMITED') {
          setStatus(
            formErrorStatus('rate-limit', error.message, error.requestId),
          );
          return;
        }
        if (error.code === 'VALIDATION_FAILED' && (mapped || tokenError)) {
          setStatus(
            formErrorStatus(
              tokenError ? 'token' : 'validation',
              error.message,
              error.requestId,
            ),
          );
          return;
        }
        setStatus(formErrorStatus('general', error.message, error.requestId));
        return;
      }

      setStatus({
        kind: 'error',
        variant: 'general',
        message: 'Något gick fel. Försök igen eller ring oss.',
      });
    } finally {
      onPendingChange?.(false);
    }
  }

  const pending = isSubmitting || status.kind === 'submitting';
  const tokenUnavailable = token.status === 'error';
  const fieldErrors: FieldErrorLink[] = visibleFields.flatMap((field) => {
    const message = errors[field.name]?.message;
    return message === undefined
      ? []
      : [{ id: `${idPrefix}-${field.suffix}`, label: field.label, message }];
  });

  const actions = (
    <div className="booking-form-actions flex flex-col gap-3 sm:flex-row sm:items-center">
      <button
        type="submit"
        form={`${idPrefix}-form`}
        className="site-button site-button-hivis relative min-w-[13rem]"
        disabled={pending}
        aria-busy={pending}
      >
        <span className={pending ? 'invisible' : undefined}>
          Skicka förfrågan
        </span>
        {pending ? (
          <span className="absolute inset-0 grid place-items-center">
            <Loader2 aria-hidden="true" className="size-5 animate-spin" />
            <span className="sr-only">Skickar förfrågan</span>
          </span>
        ) : null}
      </button>
      <a
        href={telephoneHref}
        className="site-button site-button-outline"
        aria-label={`Ring ${workshopPhone}`}
      >
        <Phone aria-hidden="true" className="size-4" />
        <span className="booking-phone-label">Ring {workshopPhone}</span>
      </a>
    </div>
  );

  return (
    <form
      ref={formRef}
      id={`${idPrefix}-form`}
      className="booking-form @container grid gap-7"
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
    >
      {tokenUnavailable || status.kind === 'error' ? (
        <BookingAlert
          variant={status.kind === 'error' ? status.variant : 'token'}
          message={
            status.kind === 'error'
              ? status.message
              : 'Formuläret kunde inte hämta säkerhetstoken. Försök igen eller ring oss.'
          }
          fieldErrors={fieldErrors}
          requestId={status.kind === 'error' ? status.requestId : undefined}
          telephoneHref={telephoneHref}
          workshopPhone={workshopPhone}
          onRefreshToken={() =>
            void token.refreshToken().catch(() => undefined)
          }
        />
      ) : null}

      <div className="absolute left-[-100vw] top-auto h-px w-px overflow-hidden">
        <label htmlFor={`${idPrefix}-website`}>Webbplats</label>
        <input
          id={`${idPrefix}-website`}
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register('website')}
        />
      </div>

      <div className="grid gap-5 @md:grid-cols-2">
        <BookingTextField
          id={`${idPrefix}-customer-name`}
          label="Namn"
          error={errors.customerName?.message}
          required
        >
          <Input
            id={`${idPrefix}-customer-name`}
            autoComplete="name"
            {...register('customerName')}
            aria-invalid={errors.customerName === undefined ? undefined : true}
            aria-describedby={
              errors.customerName === undefined
                ? undefined
                : `${idPrefix}-customer-name-error`
            }
          />
        </BookingTextField>

        <BookingTextField
          id={`${idPrefix}-phone`}
          label="Telefon"
          error={errors.phone?.message}
          required
        >
          <Input
            id={`${idPrefix}-phone`}
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="070-123 45 67"
            {...register('phone')}
            aria-invalid={errors.phone === undefined ? undefined : true}
            aria-describedby={
              errors.phone === undefined ? undefined : `${idPrefix}-phone-error`
            }
          />
        </BookingTextField>

        <BookingTextField
          id={`${idPrefix}-email`}
          label="E-post"
          error={errors.email?.message}
        >
          <Input
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="namn@example.se"
            {...register('email')}
            aria-invalid={errors.email === undefined ? undefined : true}
            aria-describedby={
              errors.email === undefined ? undefined : `${idPrefix}-email-error`
            }
          />
        </BookingTextField>

        <BookingTextField
          id={`${idPrefix}-regnr`}
          label="Registreringsnummer"
          error={errors.regNr?.message}
        >
          <Controller
            control={control}
            name="regNr"
            render={({ field }) => (
              <RegistrationNumberInput
                id={`${idPrefix}-regnr`}
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-invalid={errors.regNr === undefined ? undefined : true}
                aria-describedby={
                  errors.regNr === undefined
                    ? undefined
                    : `${idPrefix}-regnr-error`
                }
              />
            )}
          />
        </BookingTextField>

        <BookingTextField
          id={`${idPrefix}-date`}
          label="Önskad dag"
          error={errors.requestedDate?.message}
        >
          <Controller
            control={control}
            name="requestedDate"
            render={({ field }) => (
              <DatePicker
                id={`${idPrefix}-date`}
                variant="outline"
                value={
                  field.value === undefined || field.value === ''
                    ? null
                    : field.value
                }
                onChange={(next) => {
                  field.onChange(next ?? '');
                }}
                aria-label="Önskad dag"
                placeholder="Välj dag"
                disablePast
                optional
                aria-invalid={
                  errors.requestedDate === undefined ? undefined : true
                }
                aria-describedby={
                  errors.requestedDate === undefined
                    ? undefined
                    : `${idPrefix}-date-error`
                }
              />
            )}
          />
        </BookingTextField>

        <BookingTextField
          id={`${idPrefix}-time`}
          label="Tid på dagen"
          error={errors.requestedTimeOfDay?.message}
        >
          <select
            id={`${idPrefix}-time`}
            className="h-11 w-full rounded-sharp border border-input bg-transparent px-3 font-sans text-sm"
            {...register('requestedTimeOfDay')}
            aria-invalid={
              errors.requestedTimeOfDay === undefined ? undefined : true
            }
            aria-describedby={
              errors.requestedTimeOfDay === undefined
                ? undefined
                : `${idPrefix}-time-error`
            }
          >
            <option value="">Välj om du vill</option>
            {Object.entries(REQUESTED_TIME_OF_DAY_LABELS).map(
              ([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ),
            )}
          </select>
        </BookingTextField>
      </div>

      <fieldset
        id={`${idPrefix}-services`}
        tabIndex={-1}
        aria-invalid={errors.serviceTypeIds === undefined ? undefined : true}
        aria-describedby={
          errors.serviceTypeIds === undefined
            ? undefined
            : `${idPrefix}-services-error`
        }
        className="grid gap-3"
      >
        <legend className="font-sans text-sm font-bold">
          Vad gäller ärendet?
        </legend>
        <p className="text-sm text-steel/65">
          Välj en eller flera tjänster. Är du osäker kan du lämna alla tomma.
        </p>
        <div className="grid gap-3 @sm:grid-cols-2 @3xl:grid-cols-3">
          {services.map((service) => (
            <label
              key={service.slug}
              className={cn(
                'flex min-h-14 min-w-0 items-center gap-3 rounded-sharp border border-steel/20 bg-white px-4 py-3 has-checked:border-signal has-checked:bg-signal/5',
                'font-sans text-sm font-semibold hover:border-signal',
              )}
            >
              <input
                type="checkbox"
                value={service.slug}
                className="size-4 shrink-0 accent-signal"
                {...register('serviceTypeIds')}
              />
              <span>{service.name}</span>
            </label>
          ))}
        </div>
        {errors.serviceTypeIds?.message === undefined ? null : (
          <p
            id={`${idPrefix}-services-error`}
            className="font-sans text-sm text-oxide"
          >
            {errors.serviceTypeIds.message}
          </p>
        )}
      </fieldset>

      <BookingTextField
        id={`${idPrefix}-message`}
        label="Meddelande"
        error={errors.message?.message}
      >
        <textarea
          id={`${idPrefix}-message`}
          rows={4}
          className="w-full rounded-sharp border border-input bg-white px-3 py-3 font-sans text-sm leading-relaxed"
          placeholder="Berätta kort vad bilen behöver hjälp med."
          {...register('message')}
          aria-invalid={errors.message === undefined ? undefined : true}
          aria-describedby={
            errors.message === undefined
              ? undefined
              : `${idPrefix}-message-error`
          }
        />
      </BookingTextField>

      {actionsContainer ? createPortal(actions, actionsContainer) : actions}
    </form>
  );
}

function BookingTextField({
  id,
  label,
  error,
  required = false,
  children,
}: {
  readonly id: string;
  readonly label: string;
  readonly error: string | undefined;
  readonly required?: boolean;
  readonly children: ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="font-sans text-sm font-bold">
        {label}
        {required ? (
          <>
            <span aria-hidden="true" className="text-oxide">
              *
            </span>
            <span className="sr-only">(obligatoriskt)</span>
          </>
        ) : null}
      </label>
      {children}
      {error === undefined ? null : (
        <p id={errorId} className="font-sans text-sm text-oxide">
          {error}
        </p>
      )}
    </div>
  );
}

function BookingAlert({
  variant,
  message,
  fieldErrors,
  requestId,
  telephoneHref,
  workshopPhone,
  onRefreshToken,
}: {
  readonly variant: ErrorVariant;
  readonly message: string;
  readonly fieldErrors: readonly FieldErrorLink[];
  readonly requestId: string | undefined;
  readonly telephoneHref: string;
  readonly workshopPhone: string;
  readonly onRefreshToken: () => void;
}) {
  const isToken = variant === 'token';
  const hasFieldErrors = variant === 'validation' && fieldErrors.length > 0;
  return (
    <div
      role="alert"
      tabIndex={-1}
      className="grid gap-4 rounded-soft border border-oxide/25 bg-[#fff7ed] p-5 text-steel sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="flex gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 size-5 text-oxide"
        />
        <div>
          <p className="font-sans font-bold">
            {variant === 'rate-limit'
              ? 'För många försök'
              : isToken
                ? 'Formuläret behöver uppdateras'
                : variant === 'validation'
                  ? 'Kontrollera de markerade fälten'
                  : 'Förfrågan kunde inte skickas'}
          </p>
          {hasFieldErrors ? null : (
            <p className="mt-1 text-sm leading-relaxed text-steel/75">
              {message}
            </p>
          )}
          {fieldErrors.length === 0 ? null : (
            <ul className="mt-3 grid gap-1 text-sm">
              {fieldErrors.map((field) => (
                <li key={field.id}>
                  <a
                    href={`#${field.id}`}
                    className="inline-flex min-h-11 items-center underline underline-offset-4"
                    onClick={(event) => {
                      event.preventDefault();
                      revealField(document.getElementById(field.id));
                    }}
                  >
                    {field.label}: {field.message}
                  </a>
                </li>
              ))}
            </ul>
          )}
          {requestId === undefined ? null : (
            <p className="mt-2 font-sans text-xs text-steel/50">
              Referens: {requestId}
            </p>
          )}
        </div>
      </div>
      {hasFieldErrors ? null : (
        <div className="flex flex-wrap gap-2">
          {isToken ? (
            <button
              type="button"
              className="site-button site-button-dark"
              onClick={onRefreshToken}
            >
              <RotateCw aria-hidden="true" className="size-4" /> Hämta nytt
            </button>
          ) : null}
          <a href={telephoneHref} className="site-button site-button-outline">
            <Phone aria-hidden="true" className="size-4" /> Ring {workshopPhone}
          </a>
        </div>
      )}
    </div>
  );
}
