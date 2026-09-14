import { buildSparklinePoints, pointsToPolyline } from '@/lib/admin/sparkline';

const WIDTH = 240;
const HEIGHT = 48;

/** F6.4.7 — the odometer trend at a glance, oldest reading to newest. */
export function OdometerSparkline({
  readingsOldestFirst,
}: {
  readonly readingsOldestFirst: readonly number[];
}) {
  if (readingsOldestFirst.length < 2) {
    return null;
  }

  const points = buildSparklinePoints(readingsOldestFirst, WIDTH, HEIGHT);

  return (
    <svg
      viewBox={`0 0 ${String(WIDTH)} ${String(HEIGHT)}`}
      className="h-12 w-full max-w-60 text-signal"
      preserveAspectRatio="none"
      role="img"
      aria-label="Mätarställning över tid"
    >
      <polyline
        points={pointsToPolyline(points)}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
