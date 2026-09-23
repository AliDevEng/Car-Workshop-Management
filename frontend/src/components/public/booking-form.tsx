'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, Loader2, Phone, RotateCw } from 'lucide-react';
import { useState, type ReactNode } from 'react';
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

type BookingFormValues = {
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
type BookingFormField = keyof BookingFormValues;

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
      readonly variant: 'general' | 'rate-limit' | 'token';
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

function normaliseForSubmit(values: BookingFormValues, formToken: string) {
  const regNr = optionalText(values.regNr);
  const email = optionalText(values.email);
  const requestedDate = optionalText(values.requestedDate);
  const message = optionalText(values.message);
  const requestedTimeOfDay =
    values.requestedTimeOfDay === '' ? undefined : values.requestedTimeOfDay;

  return {
    website: values.website,
    formToken,
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
  setError: UseFormSetError<BookingFormValues>,
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
  variant: 'general' | 'rate-limit' | 'token',
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
  readonly defaultRegistrationNumber: string;
  readonly selectedServiceSlug: string | undefined;
  readonly services: readonly Service[];
  readonly workshopPhone: string;
  readonly telephoneHref: string;
}

export function BookingForm({
  defaultRegistrationNumber,
  selectedServiceSlug,
  services,
  workshopPhone,
  telephoneHref,
}: BookingFormProps) {
  const router = useRouter();
  const token = usePublicFormToken({ purpose: 'booking' });
  const [status, setStatus] = useState<FormStatus>({ kind: 'idle' });

  const {
    control,
    formState: { errors, isSubmitting },
    handleSubmit,
    register,
    setError,
  } = useForm<BookingFormValues>({
    defaultValues: {
      website: '',
      regNr: defaultRegistrationNumber,
      customerName: '',
      phone: '',
      requestedTimeOfDay: '',
      serviceTypeIds: getInitialServiceIds(services, selectedServiceSlug),
    },
  });

  async function submit(values: BookingFormValues) {
    setStatus({ kind: 'submitting' });

    try {
      const formToken = await token.getToken();
      const payload = publicBookingRequestInputSchema.safeParse(
        normaliseForSubmit(values, formToken),
      );

      if (!payload.success) {
        for (const issue of payload.error.issues) {
          const path = issue.path[0];
          if (typeof path === 'string' && isBookingFormField(path)) {
            setError(path, { message: issue.message });
          }
        }
        setStatus({
          kind: 'error',
          variant: 'general',
          message: 'Kontrollera uppgifterna och försök igen.',
        });
        return;
      }

      await apiFetch(
        '/public/booking-requests',
        publicBookingRequestResponseSchema,
        {
          method: 'POST',
          body: payload.data,
        },
      );

      router.push('/boka/tack');
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
              tokenError ? 'token' : 'general',
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
    }
  }

  const pending = isSubmitting || status.kind === 'submitting';
  const tokenUnavailable = token.status === 'error';

  return (
    <form
      className="grid gap-8"
      onSubmit={(event) => void handleSubmit(submit)(event)}
      noValidate
    >
      <div className="absolute left-[-100vw] top-auto h-px w-px overflow-hidden">
        <label htmlFor="booking-website">Webbplats</label>
        <input
          id="booking-website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          {...register('website')}
        />
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <BookingTextField
          id="booking-customer-name"
          label="Namn"
          error={errors.customerName?.message}
          required
        >
          <Input
            id="booking-customer-name"
            autoComplete="name"
            {...register('customerName')}
            aria-invalid={errors.customerName === undefined ? undefined : true}
            aria-describedby={
              errors.customerName === undefined
                ? undefined
                : 'booking-customer-name-error'
            }
          />
        </BookingTextField>

        <BookingTextField
          id="booking-phone"
          label="Telefon"
          error={errors.phone?.message}
          required
        >
          <Input
            id="booking-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="070-123 45 67"
            {...register('phone')}
            aria-invalid={errors.phone === undefined ? undefined : true}
            aria-describedby={
              errors.phone === undefined ? undefined : 'booking-phone-error'
            }
          />
        </BookingTextField>

        <BookingTextField
          id="booking-email"
          label="E-post"
          error={errors.email?.message}
        >
          <Input
            id="booking-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="namn@example.se"
            {...register('email')}
            aria-invalid={errors.email === undefined ? undefined : true}
            aria-describedby={
              errors.email === undefined ? undefined : 'booking-email-error'
            }
          />
        </BookingTextField>

        <BookingTextField
          id="booking-regnr"
          label="Registreringsnummer"
          error={errors.regNr?.message}
        >
          <Controller
            control={control}
            name="regNr"
            render={({ field }) => (
              <RegistrationNumberInput
                id="booking-regnr"
                value={field.value ?? ''}
                onChange={field.onChange}
                onBlur={field.onBlur}
                aria-invalid={errors.regNr === undefined ? undefined : true}
                aria-describedby={
                  errors.regNr === undefined ? undefined : 'booking-regnr-error'
                }
              />
            )}
          />
        </BookingTextField>

        <BookingTextField
          id="booking-date"
          label="Önskad dag"
          error={errors.requestedDate?.message}
        >
          <Controller
            control={control}
            name="requestedDate"
            render={({ field }) => (
              <DatePicker
                id="booking-date"
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
                    : 'booking-date-error'
                }
              />
            )}
          />
        </BookingTextField>

        <BookingTextField
          id="booking-time"
          label="Tid på dagen"
          error={errors.requestedTimeOfDay?.message}
        >
          <select
            id="booking-time"
            className="h-11 w-full rounded-sharp border border-input bg-transparent px-3 font-sans text-sm"
            {...register('requestedTimeOfDay')}
            aria-invalid={
              errors.requestedTimeOfDay === undefined ? undefined : true
            }
            aria-describedby={
              errors.requestedTimeOfDay === undefined
                ? undefined
                : 'booking-time-error'
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

      <fieldset className="grid gap-3">
        <legend className="font-sans text-sm font-bold">
          Vad gäller ärendet?
        </legend>
        <p className="text-sm text-steel/65">
          Välj en eller flera tjänster. Är du osäker kan du lämna alla tomma.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((service) => (
            <label
              key={service.slug}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-sharp border border-steel/20 bg-white px-4 py-3',
                'font-sans text-sm font-semibold hover:border-signal',
              )}
            >
              <input
                type="checkbox"
                value={service.slug}
                className="size-4 accent-signal"
                {...register('serviceTypeIds')}
              />
              <span>{service.name}</span>
            </label>
          ))}
        </div>
        {errors.serviceTypeIds?.message === undefined ? null : (
          <p className="font-sans text-sm text-oxide">
            {errors.serviceTypeIds.message}
          </p>
        )}
      </fieldset>

      <BookingTextField
        id="booking-message"
        label="Meddelande"
        error={errors.message?.message}
      >
        <textarea
          id="booking-message"
          rows={5}
          className="w-full rounded-sharp border border-input bg-white px-3 py-3 font-sans text-sm leading-relaxed"
          placeholder="Berätta kort vad bilen behöver hjälp med."
          {...register('message')}
          aria-invalid={errors.message === undefined ? undefined : true}
          aria-describedby={
            errors.message === undefined ? undefined : 'booking-message-error'
          }
        />
      </BookingTextField>

      {tokenUnavailable || status.kind === 'error' ? (
        <BookingAlert
          variant={status.kind === 'error' ? status.variant : 'token'}
          message={
            status.kind === 'error'
              ? status.message
              : 'Formuläret kunde inte hämta säkerhetstoken. Försök igen eller ring oss.'
          }
          requestId={status.kind === 'error' ? status.requestId : undefined}
          telephoneHref={telephoneHref}
          workshopPhone={workshopPhone}
          onRefreshToken={() =>
            void token.refreshToken().catch(() => undefined)
          }
        />
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button
          type="submit"
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
        <a href={telephoneHref} className="site-button site-button-outline">
          <Phone aria-hidden="true" className="size-4" /> Ring {workshopPhone}
        </a>
      </div>
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
  requestId,
  telephoneHref,
  workshopPhone,
  onRefreshToken,
}: {
  readonly variant: 'general' | 'rate-limit' | 'token';
  readonly message: string;
  readonly requestId: string | undefined;
  readonly telephoneHref: string;
  readonly workshopPhone: string;
  readonly onRefreshToken: () => void;
}) {
  const isToken = variant === 'token';
  return (
    <div
      role="alert"
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
                : 'Förfrågan kunde inte skickas'}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-steel/75">
            {message}
          </p>
          {requestId === undefined ? null : (
            <p className="mt-2 font-sans text-xs text-steel/50">
              Referens: {requestId}
            </p>
          )}
        </div>
      </div>
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
    </div>
  );
}
