import type { TrendsResult, GroupedTrendsResult, TrendsComparisonResult } from '../types';

export interface ChartJsOptions {
  label?: string;
  type?: string;
  /** Include the total series in grouped output (default true). */
  includeTotal?: boolean;
}

export interface ChartJsLineConfig {
  type: string;
  data: {
    labels: (string | number)[];
    datasets: Array<{
      label: string;
      data: number[];
    }>;
  };
  [key: string]: unknown;
}

export interface ChartJsDoughnutConfig {
  type: string;
  data: {
    labels: (string | number)[];
    datasets: Array<{
      label: string;
      data: number[];
      backgroundColor?: string[];
    }>;
  };
  [key: string]: unknown;
}

/**
 * Convert a {@link TrendsResult}, {@link GroupedTrendsResult}, or
 * {@link TrendsComparisonResult} into a Chart.js-compatible configuration object.
 * The returned config can be passed directly to the Chart.js constructor.
 *
 * @param result - The trend data from any terminal.
 * @param options - Chart label, type, and inclusion flags.
 * @returns A Chart.js config object (`{ type, data: { labels, datasets } }`).
 */
export function toChartJs(
  result: TrendsResult | GroupedTrendsResult | TrendsComparisonResult,
  options: ChartJsOptions = {},
): ChartJsLineConfig | ChartJsDoughnutConfig {
  const type = options.type ?? 'line';
  const label = options.label ?? 'Value';
  const includeTotal = options.includeTotal ?? true;

  if (isComparisonResult(result)) {
    return {
      type,
      data: {
        labels: result.labels,
        datasets: [
          { label: 'Current', data: result.current },
          { label: 'Previous', data: result.previous },
        ],
      },
    };
  }

  if (isGroupedResult(result)) {
    const datasets: Array<{ label: string; data: number[] }> = [];
    if (includeTotal) {
      datasets.push({ label: `${label} (total)`, data: result.data.total });
    }
    for (const [group, values] of Object.entries(result.data)) {
      if (group === 'total') continue;
      datasets.push({ label: group, data: values });
    }
    return { type, data: { labels: result.labels ?? [], datasets } };
  }

  return {
    type,
    data: {
      labels: result.labels,
      datasets: [{ label, data: result.data }],
    },
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
