import { describe, expect, it } from 'vitest';
import { buildSparklinePoints, pointsToPolyline } from './sparkline';

describe('buildSparklinePoints', () => {
  it('is empty for no values', () => {
    expect(buildSparklinePoints([], 100, 20)).toEqual([]);
  });

  it('centres a single value rather than dividing by zero', () => {
    expect(buildSparklinePoints([42], 100, 20)).toEqual([{ x: 50, y: 10 }]);
  });

  it('centres a flat series at mid-height', () => {
    const points = buildSparklinePoints([10, 10, 10], 100, 20, 0);
    expect(points.every((point) => point.y === 10)).toBe(true);
  });

  it('maps the lowest value to the bottom and the highest to the top', () => {
    const points = buildSparklinePoints([0, 100], 100, 20, 0);
    expect(points[0]).toEqual({ x: 0, y: 20 });
    expect(points[1]).toEqual({ x: 100, y: 0 });
  });

  it('spaces points evenly across the width', () => {
    const points = buildSparklinePoints([0, 0, 0, 0], 90, 10, 0);
    expect(points.map((point) => point.x)).toEqual([0, 30, 60, 90]);
  });
});

describe('pointsToPolyline', () => {
  it('renders the SVG points attribute format', () => {
    expect(
      pointsToPolyline([
        { x: 0, y: 10 },
        { x: 5, y: 0 },
      ]),
    ).toBe('0,10 5,0');
  });
});
