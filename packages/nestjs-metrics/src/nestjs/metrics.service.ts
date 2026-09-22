import { Inject, Injectable, Optional } from '@nestjs/common';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import {
  CacheStore,
  DataSource,
  ExecutorSpec,
  MetricsBuilder,
  MetricsOptions,
  RowsSpec,
} from 'nestjs-metrics-core';
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
    return MetricsBuilder.query(qb, this.resolve(options), cacheStore ?? this.defaults.cacheStore);
  }

  /**
   * Open a {@link MetricsBuilder} over an ORM-agnostic `DataSource` (Kysely,
   * Prisma, Drizzle, raw `pg`/`mysql2`, …), applying the resolved
   * locale/timezone/cache defaults. The TypeORM-free counterpart of
   * {@link query} — use it when the module is registered in an app that does not
   * run TypeORM.
   *
   * @param dataSource - Dialect + SQL executor that runs the emitted queries.
   * @param spec - Declares the source table/columns and optional filters.
   * @param options - Per-call locale/timezone/cache overrides.
   * @param cacheStore - Cache backend override; defaults to the module's store.
   * @returns A builder ready for chaining.
   *
   * @example
   * ```ts
   * const series = await metricsService
   *   .queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
   *   .sumByMonth('amount', 6)
   *   .trends();
   * ```
   */
  queryExecutor<R extends ObjectLiteral>(
    dataSource: DataSource,
    spec: ExecutorSpec,
    options: MetricsOptions = {},
    cacheStore?: CacheStore,
  ): MetricsBuilder<R> {
    return MetricsBuilder.queryExecutor<R>(
      dataSource,
      spec,
      this.resolve(options),
      cacheStore ?? this.defaults.cacheStore,
    );
  }

  /**
   * Open a {@link MetricsBuilder} over rows your own query layer already
   * fetched, applying the resolved locale/timezone defaults. Use it when the
   * rows come from a scoped/gated query you own — the builder only buckets,
   * fills and labels them.
   *
   * Unlike {@link query} and {@link queryExecutor}, the module's `cache`
   * default is **not** applied: in-memory rows have no stable query identity to
   * key a cache entry on, so a module-wide cache setting would otherwise make
   * every call throw. Passing `cache` explicitly at the call site still throws
   * `ConfigurationError`, as it does on the static builder.
   *
   * @param rows - The already-fetched rows to aggregate.
   * @param spec - Which row property holds the bucketing date (default `created_at`).
   * @param options - Per-call locale/timezone overrides.
   * @returns A builder ready for chaining.
   *
   * @example
   * ```ts
   * const rows = await scopedQuery.selectFrom('orders').selectAll().execute();
   * const series = await metricsService
   *   .fromRows(rows, { dateColumn: 'created_at' })
   *   .sumByMonth('amount', 6)
   *   .trends();
   * ```
   */
  fromRows(
    rows: Record<string, unknown>[],
    spec: RowsSpec = {},
    options: MetricsOptions = {},
  ): MetricsBuilder<ObjectLiteral> {
    return MetricsBuilder.fromRows(rows, spec, {
      locale: options.locale ?? this.defaults.locale,
      timezone: options.timezone ?? this.defaults.timezone,
      // The module-wide cache default is deliberately not propagated here.
      ...(options.cache ? { cache: options.cache } : {}),
    });
  }

  /** Merge call-site options over the module defaults (call-site wins). */
  private resolve(options: MetricsOptions): MetricsOptions {
    return {
      locale: options.locale ?? this.defaults.locale,
      timezone: options.timezone ?? this.defaults.timezone,
      cache: options.cache ?? this.defaults.cache,
    };
  }
}
