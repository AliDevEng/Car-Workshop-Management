import { Fragment } from 'react';

/**
 * Foundation-verification page, the admin counterpart of the root `page.tsx`.
 * It exists so F0.2.5's scoped dark surface and F0.3's fonts can actually be
 * rendered and checked; F4.3 replaces it with the real admin shell and F5
 * with the dashboard. It deliberately fetches nothing.
 */
export default function AdminFoundationPage() {
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="font-display text-2xl font-semibold">Adminpanelen</h1>
      <p className="mt-2 text-mist">Grundinställning — F0</p>
      <section className="mt-6 rounded-[var(--radius-sharp)] bg-steel-2 p-4">
        <p>Mörk yta via en avgränsad klass, inte ett globalt temaval.</p>
        <dl className="mt-3 grid grid-cols-[auto_1fr] items-baseline gap-x-4">
          {(
            [
              ['400', 'font-normal'],
              ['500', 'font-medium'],
              ['600', 'font-semibold'],
              ['700', 'font-bold'],
            ] as const
          ).map(([weight, className]) => (
            <Fragment key={weight}>
              <dt className="text-mist tabular-nums">{weight}</dt>
              <dd className={className}>Åäö åäö Ångström Ödeshög</dd>
            </Fragment>
          ))}
        </dl>
        <p className="mt-3 tabular-nums">1 234,50 kr · 12,3 mil · ABC 123</p>
      </section>
    </main>
  );
}
