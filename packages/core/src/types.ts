/** A chart-ready time series: parallel label/data arrays. */
export interface TrendsResult {
  /** Bucket labels (e.g. month names), in chart order. */
  labels: (string | number)[];
  /** Aggregate value per bucket, aligned to {@link TrendsResult.labels}. */
  data: number[];
}

/**
 * A multi-series result (from groupData): a shared label axis plus one data
 * series per group, alongside the `total` series.
 */
export interface GroupedTrendsResult {
  /** Shared bucket labels for every series, in chart order. */
  labels: (string | number)[];
  /** One numeric series per group value, plus a `total` series across all groups. */
  data: {
    total: number[];
    [group: string]: number[];
  };
}

/** A metric plus its variation against a prior period. */
export interface VariationResult {
  /** The current period's aggregate value. */
  count: number;
  /** Direction and magnitude of the change versus the prior period. */
  variation: {
    /** Whether the metric rose, fell, or held steady. */
    type: 'none' | 'increase' | 'decrease';
    /** Absolute delta, or a percentage string when requested via `inPercent`. */
    value: number | string;
  };
}

/**
 * Fired on every query execution (or cache hit). Use it to instrument with
 * OpenTelemetry, Prometheus, or any observability tool — the library itself
 * carries no runtime dependency on any of them.
 */
export interface QueryEvent {
  /** The rendered SQL with masked parameter values (OWASP A09). */
  sql: string;
  /** Wall-clock duration in milliseconds. */
  durationMs: number;
  /** The SQL dialect used ('postgres' | 'mysql' | 'sqlite'). */
  dialect: string;
  /** The execution backend ('typeorm' | 'executor'). */
  backend: string;
  /** Which terminal method produced this query. */
  terminal: 'metrics' | 'trends' | 'variations' | 'comparison' | 'invalidations';
  /** Cache status for this execution. */
  cache: 'hit' | 'miss' | 'off';
  /** Present only when the query failed; carries the error code, never the raw error. */
  error?: { code: string };
}

export type OnQueryHandler = (event: QueryEvent) => void;

/** Per-call configuration for a metrics query. */
export type { MetricsOptions } from './options.schema';
