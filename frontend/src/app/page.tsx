import { healthResponseSchema, type HealthResponse } from 'shared';
import { ApiError } from '@/lib/api';
import { apiFetchServer } from '@/lib/api/server';

async function loadHealth(): Promise<
  { ok: true; health: HealthResponse } | { ok: false; message: string }
> {
  try {
    const health = await apiFetchServer('/health', healthResponseSchema);
    return { ok: true, health };
  } catch (error) {
    const message =
      error instanceof ApiError || error instanceof Error
        ? error.message
        : 'Ett okänt fel inträffade.';
    return { ok: false, message };
  }
}

/**
 * Foundation-verification page (F0's Definition of Done: "the health
 * endpoint is rendered from a fully typed API call"). F2.2 replaces this
 * file with the real public registration-number hero.
 *
 * Health data is resolved to a plain value before any JSX is constructed —
 * React does not render JSX synchronously, so a try/catch around JSX
 * construction would not actually catch a rendering error.
 */
export default async function HomePage() {
  const result = await loadHealth();

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">Verkstadssystem</h1>
      <p className="mt-2 text-mist">Grundinställning — F0</p>
      <section className="mt-6 rounded-[var(--radius-soft)] border p-4">
        {result.ok ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 tabular-nums">
            <dt className="text-mist">Status</dt>
            <dd>{result.health.status}</dd>
            <dt className="text-mist">Version</dt>
            <dd>{result.health.version}</dd>
            <dt className="text-mist">Upptid</dt>
            <dd>{result.health.uptime.toFixed(0)} s</dd>
          </dl>
        ) : (
          <p role="alert" className="text-oxide">
            Kunde inte nå backend-tjänsten: {result.message}
          </p>
        )}
      </section>
    </main>
  );
}
