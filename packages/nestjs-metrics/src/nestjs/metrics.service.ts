import { Inject, Injectable, Optional } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { CacheStore, MetricsBuilder, MetricsOptions } from 'nestjs-metrics-core';
import { METRICS_FEATURE_OPTIONS, METRICS_ROOT_OPTIONS, MetricsModuleOptions } from './tokens';

/**
 * Injectable facade over MetricsBuilder. Resolves configuration with the
 * precedence: call-site option > forFeature > forRoot > library default.
 */
@Injectable()
export class MetricsService {
  private readonly defaults: MetricsModuleOptions;

  constructor(
    @Optional() @Inject(METRICS_ROOT_OPTIONS) root: MetricsModuleOptions = {},
    @Optional() @Inject(METRICS_FEATURE_OPTIONS) feature: MetricsModuleOptions = {},
  ) {
    // feature overrides root.
    this.defaults = { ...root, ...feature };
  }

  /**
   * Open a {@link MetricsBuilder} over a TypeORM query builder, applying the
   * resolved locale/timezone defaults (call-site options take precedence).
   *
   * @param qb - The TypeORM query builder to read from.
   * @param options - Per-call locale/timezone overrides.
   * @returns A builder ready for chaining.
   *
   * @example
   * ```ts
   * const series = await metricsService
   *   .query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth('id', 3)
   *   .trends();
   * ```
   */
  query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options: MetricsOptions = {},
    cacheStore?: CacheStore,
  ): MetricsBuilder<T> {
    return MetricsBuilder.query(qb, {
      locale: options.locale ?? this.defaults.locale,
      timezone: options.timezone ?? this.defaults.timezone,
      cache: options.cache ?? this.defaults.cache,
      onQuery: (options as Record<string, unknown>).onQuery ?? this.defaults.onQuery,
    } as MetricsOptions, cacheStore ?? this.defaults.cacheStore);
  }
}
