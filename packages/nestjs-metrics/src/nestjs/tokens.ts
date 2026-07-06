import type { CacheOptions, CacheStore } from 'nestjs-metrics-core';
import type { OnQueryHandler } from 'nestjs-metrics-core';

export const METRICS_ROOT_OPTIONS = Symbol('METRICS_ROOT_OPTIONS');
export const METRICS_FEATURE_OPTIONS = Symbol('METRICS_FEATURE_OPTIONS');

/** App-wide / per-feature defaults for the metrics module. */
export interface MetricsModuleOptions {
  locale?: string;
  timezone?: string;
  cache?: CacheOptions;
  cacheStore?: CacheStore;
  onQuery?: OnQueryHandler;
}
