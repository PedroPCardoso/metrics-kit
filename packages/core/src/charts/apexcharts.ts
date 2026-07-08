import type { TrendsResult, GroupedTrendsResult, TrendsComparisonResult } from '../types';

export interface ApexChartsOptions {
  name?: string;
  /** Include the total series in grouped output (default true). */
  includeTotal?: boolean;
}

export interface ApexChartsConfig {
  series: Array<{
    name: string;
    data: number[];
  }>;
  xaxis: {
    categories: (string | number)[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Convert a {@link TrendsResult}, {@link GroupedTrendsResult}, or
 * {@link TrendsComparisonResult} into an ApexCharts configuration object.
 *
 * @param result - The trend data from any terminal.
 * @param options - Series name and inclusion flags.
 * @returns An ApexCharts config object (`{ series, xaxis: { categories } }`).
 */
export function toApexCharts(
  result: TrendsResult | GroupedTrendsResult | TrendsComparisonResult,
  options: ApexChartsOptions = {},
): ApexChartsConfig {
  const name = options.name ?? 'Value';
  const includeTotal = options.includeTotal ?? true;

  if (isComparisonResult(result)) {
    return {
      series: [
        { name: 'Current', data: result.current },
        { name: 'Previous', data: result.previous },
      ],
      xaxis: { categories: result.labels },
    };
  }

  if (isGroupedResult(result)) {
    const series: Array<{ name: string; data: number[] }> = [];
    if (includeTotal) {
      series.push({ name: `${name} (total)`, data: result.data.total });
    }
    for (const [group, values] of Object.entries(result.data)) {
      if (group === 'total') continue;
      series.push({ name: group, data: values });
    }
    return { series, xaxis: { categories: result.labels ?? [] } };
  }

  return {
    series: [{ name, data: result.data }],
    xaxis: { categories: result.labels },
  };
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
