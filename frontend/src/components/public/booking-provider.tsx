'use client';

import { Dialog } from 'radix-ui';
import { Check, Loader2, X } from 'lucide-react';
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { services } from '@/lib/public/services';
import {
  BOOKING_ACTION_LABEL,
  BOOKING_CONFIRMATION,
  BOOKING_EXPLANATION,
} from '@/lib/public/booking-copy';
import type { BookingFormDraft } from './booking-form';

const BookingForm = lazy(() =>
  import('./booking-form').then((module) => ({ default: module.BookingForm })),
);

type OpenBooking = (trigger: HTMLButtonElement, service?: string) => void;
const BookingContext = createContext<OpenBooking | null>(null);

export function BookingProvider({
  children,
  workshopPhone,
  telephoneHref,
}: {
  readonly children: ReactNode;
  readonly workshopPhone: string;
  readonly telephoneHref: string;
}) {
  const [open, setOpen] = useState(false);
  const [service, setService] = useState<string | undefined>();
  const [received, setReceived] = useState(false);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState<BookingFormDraft>();
  const [actionsContainer, setActionsContainer] =
    useState<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  function openBooking(trigger: HTMLButtonElement, selectedService?: string) {
    triggerRef.current = trigger;
    setService((current) => selectedService ?? current);
    // A service-specific action adds its context without discarding another
    // selected service or the visitor's contact details from this visit.
    if (services.some((item) => item.slug === selectedService)) {
      setDraft((current) =>
        current === undefined ||
        selectedService === undefined ||
        current.serviceTypeIds.includes(selectedService)
          ? current
          : {
              ...current,
              serviceTypeIds: [...current.serviceTypeIds, selectedService],
            },
      );
    }
    setReceived(false);
    setOpen(true);
  }

  return (
    <BookingContext value={openBooking}>
      {children}
      <Dialog.Root
        open={open}
        onOpenChange={(next) => !pending && setOpen(next)}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="booking-backdrop" />
          <Dialog.Content
            className="public-scope booking-dialog"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              titleRef.current?.focus();
            }}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              // The menu's booking button is hidden once its menu closes.
              const trigger = triggerRef.current;
              if (
                trigger?.isConnected &&
                !trigger.closest('details:not([open])') &&
                trigger.getClientRects().length
              ) {
                trigger.focus({ preventScroll: true });
              } else {
                document
                  .querySelector<HTMLElement>('.mobile-nav > summary')
                  ?.focus();
              }
            }}
            onInteractOutside={(event) => event.preventDefault()}
          >
            <div className="booking-dialog-header">
              <p className="section-kicker">M&amp;R AUTOMOTIVE</p>
              <Dialog.Title
                ref={titleRef}
                tabIndex={-1}
                className="booking-dialog-title"
              >
                {received ? 'Tack. Vi ringer tillbaka.' : BOOKING_ACTION_LABEL}
              </Dialog.Title>
              <Dialog.Description className="mt-3 max-w-xl text-base leading-relaxed text-steel/70">
                {received ? BOOKING_CONFIRMATION : BOOKING_EXPLANATION}
              </Dialog.Description>
              <Dialog.Close
                className="booking-dialog-close"
                disabled={pending}
                aria-label="Stäng bokningsformuläret"
              >
                <X aria-hidden="true" className="size-5" />
              </Dialog.Close>
            </div>
            <div className="booking-dialog-body">
              {received ? (
                <div
                  className="grid justify-items-start gap-6 py-4"
                  role="status"
                >
                  <span className="grid size-16 place-items-center rounded-full bg-moss/10 text-moss">
                    <Check aria-hidden="true" className="size-8" />
                  </span>
                  <p className="max-w-lg text-lg leading-relaxed text-steel/75">
                    Vi går igenom dina önskemål och återkommer normalt samma
                    arbetsdag.
                  </p>
                  <Dialog.Close className="site-button site-button-dark">
                    Tillbaka till sidan
                  </Dialog.Close>
                </div>
              ) : (
                <Suspense
                  fallback={
                    <div
                      className="flex min-h-64 items-center justify-center gap-3 text-steel/70"
                      role="status"
                    >
                      <Loader2
                        aria-hidden="true"
                        className="size-5 animate-spin"
                      />
                      Laddar formuläret…
                    </div>
                  }
                >
                  <BookingForm
                    idPrefix="booking-dialog"
                    actionsContainer={actionsContainer}
                    {...(draft === undefined ? {} : { initialDraft: draft })}
                    onDraftChange={setDraft}
                    defaultRegistrationNumber=""
                    selectedServiceSlug={service}
                    services={services}
                    workshopPhone={workshopPhone}
                    telephoneHref={telephoneHref}
                    onPendingChange={setPending}
                    onSuccess={() => {
                      setDraft(undefined);
                      setService(undefined);
                      setReceived(true);
                      titleRef.current?.focus();
                    }}
                  />
                </Suspense>
              )}
            </div>
            {!received && (
              <div
                ref={setActionsContainer}
                className="booking-dialog-footer"
              />
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </BookingContext>
  );
}

export function BookingButton({
  children,
  className,
  selectedServiceSlug,
  onClick,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly selectedServiceSlug?: string;
  readonly onClick?: () => void;
}) {
  const openBooking = useContext(BookingContext);
  return (
    <button
      type="button"
      className={className}
      aria-haspopup="dialog"
      onClick={(event) => {
        onClick?.();
        openBooking?.(event.currentTarget, selectedServiceSlug);
      }}
    >
      {children}
    </button>
  );
}
