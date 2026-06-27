/** A chart-ready time series: parallel label/data arrays. */
export interface TrendsResult {
  labels: (string | number)[];
  data: number[];
}

/**
 * A multi-series result (from groupData): a shared label axis plus one data
 * series per group, alongside the `total` series.
 */
export interface GroupedTrendsResult {
  labels: (string | number)[];
  data: {
    total: number[];
    [group: string]: number[];
  };
}

/** A metric plus its variation against a prior period. */
export interface VariationResult {
  count: number;
  variation: {
    type: 'none' | 'increase' | 'decrease';
    value: number | string;
  };
}

import type { CacheOptions } from './cache/types';

/** Per-call configuration for a metrics query. */
export interface MetricsOptions {
  /** BCP-47 locale used to translate period labels. Defaults to `en`. */
  locale?: string;
  /** IANA timezone the date column is bucketed in. Defaults to `UTC`. */
  timezone?: string;
  /** Optional query-result caching. Disabled by default. */
  cache?: CacheOptions;
}
