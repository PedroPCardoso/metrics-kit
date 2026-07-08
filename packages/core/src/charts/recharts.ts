import type { TrendsResult, GroupedTrendsResult, TrendsComparisonResult } from '../types';

export interface RechartsDataPoint {
  label: string | number;
  value: number;
}

export interface RechartsGroupedDataPoint {
  label: string | number;
  [seriesName: string]: number | string;
}

/**
 * Convert a simple {@link TrendsResult} into a Recharts-compatible array of
 * `{ label, value }` objects. Works with `<LineChart>`, `<BarChart>`, etc.
 *
 * @param result - A simple trend series.
 * @returns An array of `{ label, value }` objects ready for Recharts.
 */
export function toRecharts(result: TrendsResult): RechartsDataPoint[];
/**
 * Convert a {@link GroupedTrendsResult} into a Recharts-compatible array where
 * each point carries the label plus a numeric field for every series.
 *
 * @param result - A grouped trend result.
 * @returns An array of objects with `label` and one numeric field per group.
 */
export function toRecharts(result: GroupedTrendsResult): RechartsGroupedDataPoint[];
/**
 * Convert a {@link TrendsComparisonResult} into a Recharts-compatible array
 * where each point carries the label plus `current` and `previous` fields.
 *
 * @param result - A comparison trend result.
 * @returns An array of objects with `label`, `current`, and `previous`.
 */
export function toRecharts(result: TrendsComparisonResult): RechartsGroupedDataPoint[];
export function toRecharts(
  result: TrendsResult | GroupedTrendsResult | TrendsComparisonResult,
): (RechartsDataPoint | RechartsGroupedDataPoint)[] {
  if (isComparisonResult(result)) {
    return result.labels.map((label, i) => ({
      label,
      current: result.current[i] ?? 0,
      previous: result.previous[i] ?? 0,
    }));
  }

  if (isGroupedResult(result)) {
    const seriesNames = Object.keys(result.data);
    return (result.labels ?? []).map((label, i) => {
      const point: RechartsGroupedDataPoint = { label };
      for (const name of seriesNames) {
        point[name] = result.data[name][i] ?? 0;
      }
      return point;
    });
  }

  return result.labels.map((label, i) => ({
    label,
    value: result.data[i] ?? 0,
  }));
}

function isComparisonResult(
  r: TrendsResult | GroupedTrendsResult | TrendsComparisonResult,
): r is TrendsComparisonResult {
  return 'current' in r && 'previous' in r;
}

function isGroupedResult(
  r: TrendsResult | GroupedTrendsResult | TrendsComparisonResult,
): r is GroupedTrendsResult {
  return 'data' in r && typeof (r as GroupedTrendsResult).data === 'object' && 'total' in (r as GroupedTrendsResult).data;
}
