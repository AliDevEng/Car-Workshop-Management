export interface SparklinePoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Maps a series of values onto an SVG viewbox, oldest first.
 *
 * A flat series (every value equal, or a single point) maps to the vertical
 * centre rather than dividing by zero — a vehicle with one odometer reading
 * gets a flat line at mid-height, not `NaN` coordinates that silently drop
 * the point from the rendered `<polyline>`.
 */
export function buildSparklinePoints(
  values: readonly number[],
  width: number,
  height: number,
  padding = 4,
): readonly SparklinePoint[] {
  if (values.length === 0) {
    return [];
  }

  if (values.length === 1) {
    return [{ x: width / 2, y: height / 2 }];
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const usableWidth = width - padding * 2;
  const usableHeight = height - padding * 2;

  return values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * usableWidth;
    const y =
      max === min
        ? height / 2
        : height - padding - ((value - min) / (max - min)) * usableHeight;
    return { x, y };
  });
}

export function pointsToPolyline(points: readonly SparklinePoint[]): string {
  return points.map((point) => `${String(point.x)},${String(point.y)}`).join(' ');
}
