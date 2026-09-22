import { DateTime } from 'luxon';
import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Aggregate } from './enums/aggregate.enum';
import { Period } from './enums/period.enum';
import { InvalidPeriodException } from './exceptions/invalid-period.exception';
import { InvalidVariationsCountException } from './exceptions/invalid-variations-count.exception';
import { ConfigurationError } from './exceptions/configuration.exception';
import { UnsupportedInRowsModeException } from './exceptions/unsupported-in-rows-mode.exception';
import { assertAggregate, assertDateFormat, assertSafeIdentifier, assertTimezone } from './validation';
import { validateExecutorSpec, validateMetricsOptions } from './options.schema';
import { dialectFor } from './dialects/dialect.factory';
import { DatePart } from './dialects/sql-dialect.interface';
import { QueryBackend } from './backend/query-backend.interface';
import {
  ColumnRef,
  Filter,
  SelectExpr,
  SemanticPlan,
  SemanticSelectItem,
} from './backend/semantic-plan';
import { TypeOrmBackend } from './backend/typeorm.backend';
import { ExecutorBackend } from './backend/executor.backend';
import { RowsBackend } from './backend/rows.backend';
import { DataSource, ExecutorSpec, RowsSpec } from './datasource';
import { WhereCondition, WhereInput, WhereScalar } from './where';
import { normalizeData, normalizeLabel } from './formatting/normalize';
import { PeriodResolver } from './dates/period-resolver';
import { enumerateBuckets } from './dates/bucket-series';
import { LabelFormatter } from './formatting/label-formatter';
import {
  RawTrendRow,
  TrendsFormatter,
  percentArray,
  toPercent,
} from './formatting/trends.formatter';
import { gapFillRaw, populate, presentIntegerLabels } from './formatting/missing-data';
import {
  GroupedTrendsResult,
  MetricsOptions,
  TrendsComparisonResult,
  TrendsResult,
  VariationResult,
} from './types';
import { PERIOD_TO_DATE_PART, toTrendRow, isRecord } from './types/helpers';
import type { CacheOptions, CacheStore } from './cache/types';
import { planCacheKey } from './cache/cache-key';
import { defaultCacheStore } from './cache/shared';

const DEFAULT_LOCALE = 'en';
const DEFAULT_TIMEZONE = 'UTC';

/**
 * Fluent builder that turns a query source into chart-ready metrics and trends.
 * It runs over a TypeORM `SelectQueryBuilder` (see {@link query}) or, ORM-agnostically,
 * over a {@link DataSource} such as Prisma or Drizzle (see {@link queryExecutor}). The
 * chain is synchronous; only the terminal methods ({@link metrics}, {@link trends},
 * {@link metricsWithVariations}) execute against the database and are async.
 *
 * @typeParam T - Row/entity shape the underlying query produces.
 *
 * @example
 * ```ts
 * // Single value: total revenue.
 * const revenue = await Metrics.query(orderRepo.createQueryBuilder('order'))
 *   .sum('amount')
 *   .metrics();
 *
 * // Time series: order counts for the last 3 months.
 * const series = await Metrics.query(orderRepo.createQueryBuilder('order'))
 *   .countByMonth('id', 3)
 *   .trends();
 * ```
 *
 * @see {@link metricsFor} and {@link withMetrics} for repository-centric entry points.
 */
export class MetricsBuilder<T extends ObjectLiteral> {
  /**
   * Set to `true` to skip Zod schema validation on constructor and queryExecutor
   * entry points. Useful when the caller already validates or when every
   * microsecond matters in hot paths.
   */
  static skipValidation = false;

  private tableName: string;
  private readonly locale: string;
  private readonly timezone: string;
  private aggregateFn: Aggregate = Aggregate.COUNT;
  private columnRef: ColumnRef;
  private dateColumnName: ColumnRef;
  private period: Period | null = null;
  /** Window size for the period (0 = whole period). Named to avoid colliding with the count() aggregate method. */
  private windowCount = 0;
  /** Explicit date range (set by between/from); takes precedence over period. */
  private range: { start: string; end: string } | null = null;
  /** Granularity used to bucket a date range. */
  private groupBy: DatePart = 'day';
  /** Categorical column to group by instead of a date period. */
  private labelColumnRef: ColumnRef | null = null;
  /** Structured scoping filters (ANDed onto every query), in call order. */
  private extraWhere: { column: ColumnRef; condition: WhereCondition }[] = [];
  private fill = false;
  private missingValue = 0;
  private missingLabels: (string | number)[] = [];
  private cumulativeData = false;
  private groupedLabels: (string | number)[] | null = null;
  private groupedAggregate: Aggregate = Aggregate.SUM;
  private caching: CacheOptions | null = null;
  private cacheStore: CacheStore | undefined;
  /** Set by fromRows(); gates SQL-only settings like table(). */
  private rowsMode = false;
  private now = new Date();
  private year: number = this.now.getFullYear();
  private month: number = this.now.getMonth() + 1;
  private day: number = this.now.getDate();
  private week: number = isoWeek(this.now);
  private hour: number = this.now.getHours();

  /**
   * @internal Construct via the {@link query} or {@link queryExecutor} factories
   * rather than directly; the constructor takes an internal backend.
   */
  constructor(
    private readonly backend: QueryBackend,
    tableName: string,
    options: MetricsOptions = {},
    cacheStore?: CacheStore,
    private readonly sourceIdentity = tableName,
  ) {
    if (!MetricsBuilder.skipValidation) {
      validateMetricsOptions(options);
    }
    this.tableName = tableName;
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.timezone = options.timezone ?? DEFAULT_TIMEZONE;
    assertTimezone(this.timezone);
    if (options.cache?.enabled) {
      this.caching = options.cache;
      this.cacheStore = cacheStore ?? defaultCacheStore;
    }
    this.columnRef = this.ref('id');
    this.dateColumnName = this.ref('created_at');
  }

  /**
   * Single choke point that turns a bare column name into a validated,
   * table-captured reference. Every consumer-supplied identifier passes
   * through here: it is validated against the allowlist so it can never
   * inject SQL (named parameters do not protect identifiers); the backend
   * escapes it at render time. The table is captured when the column is
   * configured, so a later .table() call does not retroactively re-qualify
   * earlier columns.
   */
  private ref(column: string): ColumnRef {
    assertSafeIdentifier(column);
    return { table: this.tableName, column };
  }

  /**
   * A fresh builder over a clone of the query, carrying the aggregate/column
   * state needed for a bare metric. Single place to copy metric-affecting
   * state (extend here when adding new aggregate-relevant fields, e.g. timezone).
   */
  private baseClone(): MetricsBuilder<T> {
    // The backend clones the underlying query per run(), so it is safe to share.
    const clone = new MetricsBuilder<T>(this.backend, this.tableName, {
      locale: this.locale,
      timezone: this.timezone,
    }, this.cacheStore, this.sourceIdentity);
    clone.aggregateFn = this.aggregateFn;
    clone.columnRef = this.columnRef;
    clone.dateColumnName = this.dateColumnName;
    clone.tableName = this.tableName;
    clone.extraWhere = [...this.extraWhere];
    clone.caching = this.caching;
    clone.cacheStore = this.cacheStore;
    clone.rowsMode = this.rowsMode;
    return clone;
  }

  /**
   * Entry point over a TypeORM `SelectQueryBuilder` (the original API). The
   * builder's table alias comes from `qb.alias`, so columns qualify correctly.
   *
   * @param qb - The TypeORM query builder to read from.
   * @param options - Locale, timezone and cache options for the query.
   * @param cacheStore - Cache backend to use when `options.cache.enabled`; defaults to a shared in-memory store.
   * @returns A builder ready for chaining.
   * @throws {@link InvalidTimezoneException} when `options.timezone` is not a valid IANA zone.
   *
   * @example
   * ```ts
   * const count = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .count()
   *   .metrics();
   * ```
   */
  static query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options?: MetricsOptions,
    cacheStore?: CacheStore,
  ): MetricsBuilder<T> {
    return new MetricsBuilder(new TypeOrmBackend(qb), qb.alias, options, cacheStore, qb.getQuery());
  }

  /**
   * Entry point over an ORM-agnostic {@link DataSource} (Prisma, Drizzle, …).
   * Reads from `spec.table` (or a raw `spec.from` fragment), bucketing
   * `spec.dateColumn` and applying any `spec.where` filters to every query.
   *
   * @param dataSource - Dialect + SQL executor that runs the emitted queries.
   * @param spec - Declares the source table/columns and optional filters; see {@link ExecutorSpec}.
   * @param options - Locale, timezone and cache options for the query.
   * @param cacheStore - Cache backend to use when `options.cache.enabled`; defaults to a shared in-memory store.
   * @returns A builder ready for chaining.
   * @throws {@link InvalidIdentifierException} when `spec.table` is not a plain SQL identifier.
   *
   * @example
   * ```ts
   * const series = await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
   *   .sumByMonth('amount', 6)
   *   .trends();
   * ```
   */
  static queryExecutor<R extends ObjectLiteral>(
    dataSource: DataSource,
    spec: ExecutorSpec,
    options?: MetricsOptions,
    cacheStore?: CacheStore,
  ): MetricsBuilder<R> {
    if (!MetricsBuilder.skipValidation) {
      validateExecutorSpec(spec);
    }
    assertSafeIdentifier(spec.table);
    const dialect = dialectFor(dataSource.dialect);
    const from = spec.from ?? dialect.escapeId(spec.table);
    const builder = new MetricsBuilder<R>(
      new ExecutorBackend(dataSource, from),
      spec.table,
      options,
      cacheStore,
      from,
    );
    if (spec.dateColumn) {
      builder.dateColumn(spec.dateColumn);
    }
    if (spec.where) {
      builder.applyExecutorWhere(spec.where);
    }
    return builder;
  }

  /** Store structured executor-mode filters (set by queryExecutor). */
  private applyExecutorWhere(where: WhereInput): void {
    for (const [column, condition] of Object.entries(where)) {
      this.where(column, condition);
    }
  }

  /**
   * Entry point over pre-fetched rows: the caller owns 100% of the SQL (e.g. a
   * scoped/visibility-gated query); the builder does the bucketing, gap fill,
   * timezone handling and labels. Full API parity with the SQL modes.
   *
   * Caching is not supported here — in-memory rows have no stable query
   * identity to key on — so `options.cache.enabled` is rejected rather than
   * silently ignored.
   *
   * @param rows - The pre-fetched rows to aggregate over.
   * @param spec - Which row property carries the bucketing date; see {@link RowsSpec}.
   * @param options - Locale and timezone options for the series.
   * @returns A builder ready for chaining.
   * @throws {@link ConfigurationError} when `options.cache.enabled` is set.
   */
  static fromRows(
    rows: Record<string, unknown>[],
    spec: RowsSpec = {},
    options?: MetricsOptions,
  ): MetricsBuilder<ObjectLiteral> {
    if (options?.cache?.enabled) {
      throw new ConfigurationError(
        'nestjs-metrics: caching is not supported with fromRows() — in-memory rows have no stable query identity to key a cache entry on.',
        'Remove options.cache (or set cache.enabled to false), or use query()/queryExecutor() if you need caching.',
        { operation: 'fromRows' },
      );
    }
    const builder = new MetricsBuilder<ObjectLiteral>(new RowsBackend(rows), 'rows', options);
    builder.rowsMode = true;
    if (spec.dateColumn) {
      builder.dateColumn(spec.dateColumn);
    }
    return builder;
  }

  // --- Aggregates ---------------------------------------------------------

  private aggregate(fn: Aggregate, column: string): this {
    assertAggregate(fn);
    this.aggregateFn = fn;
    this.columnRef = this.ref(column);
    return this;
  }

  /**
   * Aggregate by counting rows.
   * @param column - Column to count (default `id`).
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  count(column = 'id'): this {
    return this.aggregate(Aggregate.COUNT, column);
  }

  /**
   * Aggregate by counting distinct values in a column (`COUNT(DISTINCT ...)`).
   * @param column - Column to count distinct values of (default `id`).
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  countDistinct(column = 'id'): this {
    return this.aggregate(Aggregate.COUNT_DISTINCT, column);
  }

  // --- Targeting ----------------------------------------------------------

  /**
   * Bucket by a date column other than `created_at`.
   * @param column - Date column to bucket on.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  dateColumn(column: string): this {
    this.dateColumnName = this.ref(column);
    return this;
  }

  /**
   * Override the table used to qualify subsequent columns (e.g. a joined table).
   * @param name - Table name to qualify with from here on.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `name` is not a plain SQL identifier.
   * @throws {@link UnsupportedInRowsModeException} when the builder came from {@link fromRows}.
   */
  table(name: string): this {
    if (this.rowsMode) {
      throw new UnsupportedInRowsModeException('table');
    }
    // Stored raw-but-validated; captured per-column each time ref() runs.
    assertSafeIdentifier(name);
    this.tableName = name;
    return this;
  }

  /**
   * Group the series by a categorical column instead of by a date period. Note
   * that the period/range WHERE filter still applies — to group within a single
   * year use e.g. `sumByYear('amount', 1).forYear(2024).labelColumn('status')`.
   *
   * @param column - Categorical column to group by.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   *
   * @example
   * ```ts
   * const byStatus = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .sumByYear('amount', 1)
   *   .forYear(2024)
   *   .labelColumn('status')
   *   .trends();
   * ```
   */
  labelColumn(column: string): this {
    this.labelColumnRef = this.ref(column);
    return this;
  }

  /**
   * AND a structured condition onto every query this builder runs: scalar =
   * equality, array = IN (an empty array matches nothing — fail closed),
   * object = range (`gte`/`lte`/`gt`/`lt`), `null` = IS NULL. Values always
   * bind as parameters; the column name is validated
   * (`assertSafeIdentifier`) and driver-escaped. Chain multiple calls to AND
   * conditions. This is the hook for scoping / visibility gates, and it also
   * scopes the label auto-discovery queries behind {@link fillMissingData}
   * and {@link groupData}.
   *
   * @param column - Column to filter on.
   * @param condition - Equality, membership, range, or `null`.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   *
   * @example
   * ```ts
   * const mine = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth()
   *   .where('tenant_id', tenantId)
   *   .trends();
   * ```
   */
  where(column: string, condition: WhereCondition): this {
    this.extraWhere.push({ column: this.ref(column), condition });
    return this;
  }

  /**
   * Sugar for `where(column, values)`: membership with bound parameters.
   * @param column - Column to filter on.
   * @param values - Allowed values; an empty array matches nothing.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  whereIn(column: string, values: WhereScalar[]): this {
    return this.where(column, values);
  }

  /**
   * Fill gaps in a trend series with a default value (0), auto-discovering the
   * expected labels. An explicit label set can be supplied for categorical
   * series.
   *
   * @param missingValue - Value to insert for missing buckets (default `0`).
   * @param missingLabels - Explicit label set for categorical series; defaults to auto-discovered labels.
   * @returns This builder, for chaining.
   */
  fillMissingData(missingValue = 0, missingLabels: (string | number)[] = []): this {
    this.fill = true;
    this.missingValue = missingValue;
    this.missingLabels = missingLabels;
    return this;
  }

  /**
   * Convert each data series into a running total (cumulative sum). Works with
   * both simple {@link TrendsResult} and {@link GroupedTrendsResult} (from
   * {@link groupData}).
   *
   * @returns This builder, for chaining.
   *
   * @example
   * ```ts
   * const cumulative = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth()
   *   .cumulative()
   *   .trends();
   * // data: [2, 5, 8, ...] instead of [2, 3, 3, ...]
   * ```
   */
  cumulative(): this {
    this.cumulativeData = true;
    return this;
  }

  /**
   * Split the aggregate column into one data series per value, for a stacked /
   * bucket (`aggregate(CASE WHEN column = value THEN 1 ELSE 0 END)`), and
   * `total` carries the main aggregate per bucket. {@link trends} then returns a
   * {@link GroupedTrendsResult} instead of a {@link TrendsResult}.
   *
   * When `labels` is omitted (or empty), the distinct column values are
   * auto-discovered by querying the database.
   *
   * @param labels - Optional column values to split into series; auto-discovered when omitted.
   * @param aggregate - Aggregate function for each series (default {@link Aggregate.SUM}).
   * @returns This builder, for chaining.
   * @throws {@link InvalidAggregateException} when `aggregate` is not a supported function.
   */
  groupData(labels?: (string | number)[], aggregate?: Aggregate): this {
    if (aggregate !== undefined) {
      assertAggregate(aggregate);
      this.groupedAggregate = aggregate;
    }
    this.groupedLabels = labels ?? [];
    return this;
  }

  /**
   * Aggregate by summing `column`.
   * @param column - Numeric column to sum.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  sum(column: string): this {
    return this.aggregate(Aggregate.SUM, column);
  }

  /**
   * Aggregate by averaging `column`.
   * @param column - Numeric column to average.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  average(column: string): this {
    return this.aggregate(Aggregate.AVERAGE, column);
  }

  /**
   * Aggregate by taking the maximum of `column`.
   * @param column - Column to take the maximum of.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  max(column: string): this {
    return this.aggregate(Aggregate.MAX, column);
  }

  /**
   * Aggregate by taking the minimum of `column`.
   * @param column - Column to take the minimum of.
   * @returns This builder, for chaining.
   * @throws {@link InvalidIdentifierException} when `column` is not a plain SQL identifier.
   */
  min(column: string): this {
    return this.aggregate(Aggregate.MIN, column);
  }

  // --- Periods ------------------------------------------------------------

  private by(period: Period, count = 0): this {
    this.period = period;
    this.windowCount = count;
    return this;
  }

  /**
   * Bucket the series by day.
   * @param count - Window size: `0` the whole period, `1` a single day, `>1` the last `count` days.
   * @returns This builder, for chaining.
   */
  byDay(count = 0): this {
    return this.by(Period.DAY, count);
  }

  /**
   * Bucket the series by week.
   * @param count - Window size: `0` the whole period, `1` a single week, `>1` the last `count` weeks.
   * @returns This builder, for chaining.
   */
  byWeek(count = 0): this {
    return this.by(Period.WEEK, count);
  }

  /**
   * Bucket the series by month.
   * @param count - Window size: `0` the whole period, `1` a single month, `>1` the last `count` months.
   * @returns This builder, for chaining.
   */
  byMonth(count = 0): this {
    return this.by(Period.MONTH, count);
  }

  /**
   * Bucket the series by hour.
   * @param count - Window size: `0` the whole period, `1` a single hour, `>1` the last `count` hours.
   * @returns This builder, for chaining.
   */
  byHour(count = 0): this {
    return this.by(Period.HOUR, count);
  }

  /**
   * Bucket the series by year.
   * @param count - Window size: `0` the whole period, `1` a single year, `>1` the last `count` years.
   * @returns This builder, for chaining.
   */
  byYear(count = 0): this {
    return this.by(Period.YEAR, count);
  }

  // --- Date ranges --------------------------------------------------------

  /**
   * Scope the query to an explicit, inclusive date range (overrides any period).
   * Pair with a `groupBy*` method to choose the bucket granularity.
   *
   * @param start - Range start as an ISO `YYYY-MM-DD` date.
   * @param end - Range end as an ISO `YYYY-MM-DD` date.
   * @returns This builder, for chaining.
   * @throws {@link InvalidDateFormatException} when a bound is not a valid `YYYY-MM-DD` date.
   */
  between(start: string, end: string): this {
    assertDateFormat(start);
    assertDateFormat(end);
    this.range = { start, end };
    this.period = null;
    return this;
  }

  /**
   * Scope the query from `date` up to today (an open-ended {@link between}).
   * @param date - Range start as an ISO `YYYY-MM-DD` date.
   * @returns This builder, for chaining.
   * @throws {@link InvalidDateFormatException} when `date` is not a valid `YYYY-MM-DD` date.
   */
  from(date: string): this {
    return this.between(date, today());
  }

  private setGroupBy(part: DatePart): this {
    this.groupBy = part;
    return this;
  }

  /** Bucket a {@link between}/{@link from} range by day. @returns This builder, for chaining. */
  groupByDay(): this {
    return this.setGroupBy('day');
  }

  /** Bucket a {@link between}/{@link from} range by week. @returns This builder, for chaining. */
  groupByWeek(): this {
    return this.setGroupBy('week');
  }

  /** Bucket a {@link between}/{@link from} range by month. @returns This builder, for chaining. */
  groupByMonth(): this {
    return this.setGroupBy('month');
  }

  /** Bucket a {@link between}/{@link from} range by hour. @returns This builder, for chaining. */
  groupByHour(): this {
    return this.setGroupBy('hour');
  }

  /** Bucket a {@link between}/{@link from} range by year. @returns This builder, for chaining. */
  groupByYear(): this {
    return this.setGroupBy('year');
  }

  // --- Reference point pinning -------------------------------------------

  /**
   * Pin the reference day used by `byDay` window calculations (defaults to today).
   * @param day - Day of month (1–31).
   * @returns This builder, for chaining.
   */
  forDay(day: number): this {
    this.day = day;
    return this;
  }

  /**
   * Pin the reference week used by `byWeek` window calculations (defaults to the current week).
   * @param week - ISO-8601 week number.
   * @returns This builder, for chaining.
   */
  forWeek(week: number): this {
    this.week = week;
    return this;
  }

  /**
   * Pin the reference month used by `byMonth` window calculations (defaults to the current month).
   * @param month - Month number (1–12).
   * @returns This builder, for chaining.
   */
  forMonth(month: number): this {
    this.month = month;
    return this;
  }

  /**
   * Pin the reference hour used by `byHour` window calculations (defaults to the current hour, 0–23).
   * @param hour - Hour of the day (0–23).
   * @returns This builder, for chaining.
   */
  forHour(hour: number): this {
    this.hour = hour;
    return this;
  }

  /**
   * Pin the reference year used by `byYear` window calculations (defaults to the current year).
   * @param year - Four-digit year.
   * @returns This builder, for chaining.
   */
  forYear(year: number): this {
    this.year = year;
    return this;
  }

  // --- Combined shorthands ------------------------------------------------

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byDay}. */
  countByDay(column = 'id', count = 0): this {
    return this.count(column).byDay(count);
  }

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byWeek}. */
  countByWeek(column = 'id', count = 0): this {
    return this.count(column).byWeek(count);
  }

  /**
   * Shorthand for {@link MetricsBuilder.count | count} + {@link byMonth}.
   * @param column - Column to count (default `id`).
   * @param count - Month window: `0` whole period, `1` single month, `>1` last `count` months.
   * @returns This builder, for chaining.
   *
   * @example
   * ```ts
   * const series = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth('id', 6)
   *   .trends();
   * ```
   */
  countByMonth(column = 'id', count = 0): this {
    return this.count(column).byMonth(count);
  }

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byHour}. */
  countByHour(column = 'id', count = 0): this {
    return this.count(column).byHour(count);
  }

  /** Shorthand for {@link MetricsBuilder.count | count} + {@link byYear}. */
  countByYear(column = 'id', count = 0): this {
    return this.count(column).byYear(count);
  }

  /** Shorthand for {@link countDistinct} + {@link byDay}. */
  countDistinctByDay(column = 'id', count = 0): this {
    return this.countDistinct(column).byDay(count);
  }

  /** Shorthand for {@link countDistinct} + {@link byWeek}. */
  countDistinctByWeek(column = 'id', count = 0): this {
    return this.countDistinct(column).byWeek(count);
  }

  /** Shorthand for {@link countDistinct} + {@link byMonth}. */
  countDistinctByMonth(column = 'id', count = 0): this {
    return this.countDistinct(column).byMonth(count);
  }

  /** Shorthand for {@link countDistinct} + {@link byYear}. */
  countDistinctByYear(column = 'id', count = 0): this {
    return this.countDistinct(column).byYear(count);
  }

  /** Shorthand for {@link sum} + {@link byDay}. */
  sumByDay(column: string, count = 0): this {
    return this.sum(column).byDay(count);
  }

  /** Shorthand for {@link sum} + {@link byWeek}. */
  sumByWeek(column: string, count = 0): this {
    return this.sum(column).byWeek(count);
  }

  /** Shorthand for {@link sum} + {@link byMonth}. */
  sumByMonth(column: string, count = 0): this {
    return this.sum(column).byMonth(count);
  }

  /** Shorthand for {@link sum} + {@link byHour}. */
  sumByHour(column: string, count = 0): this {
    return this.sum(column).byHour(count);
  }

  /**
   * Shorthand for {@link sum} + {@link byYear}.
   * @param column - Numeric column to sum.
   * @param count - Year window: `0` whole period, `1` single year, `>1` last `count` years.
   * @returns This builder, for chaining.
   *
   * @example
   * ```ts
   * const revenuePerYear = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .sumByYear('amount', 5)
   *   .trends();
   * ```
   */
  sumByYear(column: string, count = 0): this {
    return this.sum(column).byYear(count);
  }

  /** Shorthand for {@link average} + {@link byDay}. */
  averageByDay(column: string, count = 0): this {
    return this.average(column).byDay(count);
  }

  /** Shorthand for {@link average} + {@link byWeek}. */
  averageByWeek(column: string, count = 0): this {
    return this.average(column).byWeek(count);
  }

  /** Shorthand for {@link average} + {@link byMonth}. */
  averageByMonth(column: string, count = 0): this {
    return this.average(column).byMonth(count);
  }

  /** Shorthand for {@link average} + {@link byHour}. */
  averageByHour(column: string, count = 0): this {
    return this.average(column).byHour(count);
  }

  /** Shorthand for {@link average} + {@link byYear}. */
  averageByYear(column: string, count = 0): this {
    return this.average(column).byYear(count);
  }

  /** Shorthand for {@link max} + {@link byDay}. */
  maxByDay(column: string, count = 0): this {
    return this.max(column).byDay(count);
  }

  /** Shorthand for {@link max} + {@link byWeek}. */
  maxByWeek(column: string, count = 0): this {
    return this.max(column).byWeek(count);
  }

  /** Shorthand for {@link max} + {@link byMonth}. */
  maxByMonth(column: string, count = 0): this {
    return this.max(column).byMonth(count);
  }

  /** Shorthand for {@link max} + {@link byHour}. */
  maxByHour(column: string, count = 0): this {
    return this.max(column).byHour(count);
  }

  /** Shorthand for {@link max} + {@link byYear}. */
  maxByYear(column: string, count = 0): this {
    return this.max(column).byYear(count);
  }

  /** Shorthand for {@link min} + {@link byDay}. */
  minByDay(column: string, count = 0): this {
    return this.min(column).byDay(count);
  }

  /** Shorthand for {@link min} + {@link byWeek}. */
  minByWeek(column: string, count = 0): this {
    return this.min(column).byWeek(count);
  }

  /** Shorthand for {@link min} + {@link byMonth}. */
  minByMonth(column: string, count = 0): this {
    return this.min(column).byMonth(count);
  }

  /** Shorthand for {@link min} + {@link byHour}. */
  minByHour(column: string, count = 0): this {
    return this.min(column).byHour(count);
  }

  /** Shorthand for {@link min} + {@link byYear}. */
  minByYear(column: string, count = 0): this {
    return this.min(column).byYear(count);
  }

  /** Shorthand for {@link count} + {@link between}. */
  countBetween([start, end]: [string, string], column = 'id'): this {
    return this.count(column).between(start, end);
  }

  /** Shorthand for {@link countDistinct} + {@link between}. */
  countDistinctBetween([start, end]: [string, string], column = 'id'): this {
    return this.countDistinct(column).between(start, end);
  }

  /** Shorthand for {@link sum} + {@link between}. */
  sumBetween([start, end]: [string, string], column: string): this {
    return this.sum(column).between(start, end);
  }

  /** Shorthand for {@link average} + {@link between}. */
  averageBetween([start, end]: [string, string], column: string): this {
    return this.average(column).between(start, end);
  }

  /** Shorthand for {@link max} + {@link between}. */
  maxBetween([start, end]: [string, string], column: string): this {
    return this.max(column).between(start, end);
  }

  /** Shorthand for {@link min} + {@link between}. */
  minBetween([start, end]: [string, string], column: string): this {
    return this.min(column).between(start, end);
  }

  /** Shorthand for {@link count} + {@link from}. */
  countFrom(date: string, column = 'id'): this {
    return this.count(column).from(date);
  }

  /** Shorthand for {@link countDistinct} + {@link from}. */
  countDistinctFrom(date: string, column = 'id'): this {
    return this.countDistinct(column).from(date);
  }

  /** Shorthand for {@link sum} + {@link from}. */
  sumFrom(date: string, column: string): this {
    return this.sum(column).from(date);
  }

  /** Shorthand for {@link average} + {@link from}. */
  averageFrom(date: string, column: string): this {
    return this.average(column).from(date);
  }

  /** Shorthand for {@link max} + {@link from}. */
  maxFrom(date: string, column: string): this {
    return this.max(column).from(date);
  }

  /** Shorthand for {@link min} + {@link from}. */
  minFrom(date: string, column: string): this {
    return this.min(column).from(date);
  }

  // --- Terminals ----------------------------------------------------------

  /**
   * Execute the query and return a single aggregate value.
   * @returns The aggregate value, or `0` when no rows match.
   *
   * @example
   * ```ts
   * const total = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .sum('amount')
   *   .metrics();
   * ```
   */
  async metrics(): Promise<number> {
    const plan = this.metricsPlan();
    const rows = await this.withCache(plan, () => this.backend.run(plan));
    return normalizeData(rows[0]?.data);
  }

  /**
   * Return the SQL string the {@link metrics} terminal method would execute,
   * without actually running it. Parameter values are shown inline; pass
   * `{ mask: true }` to redact them with `'[REDACTED]'`.
   *
   * @param options - When `mask` is true parameter values are redacted.
   * @returns The rendered SQL with bound parameter values.
   * @throws {@link UnsupportedInRowsModeException} in {@link fromRows} mode, where there is no SQL.
   */
  toSql(options?: { mask?: boolean }): string {
    return this.backend.toSql(this.metricsPlan(), options?.mask);
  }

  /**
   * Return the SQL string the {@link trends} terminal method would execute,
   * without actually running it. Parameter values are shown inline; pass
   * `{ mask: true }` to redact them with `'[REDACTED]'`.
   *
   * @param options - When `mask` is true parameter values are redacted.
   * @returns The rendered SQL with bound parameter values.
   * @throws {@link UnsupportedInRowsModeException} in {@link fromRows} mode, where there is no SQL.
   */
  toTrendsSql(options?: { mask?: boolean }): string {
    return this.backend.toSql(this.trendsPlan(), options?.mask);
  }

  /**
   * Remove the cached entry for the current single-metric query shape. A
   * harmless no-op when caching is off, including in {@link fromRows} mode,
   * where caching is never available.
   */
  async invalidateMetrics(): Promise<void> {
    if (this.rowsMode) {
      return;
    }
    await this.invalidateCache(this.metricsPlan());
  }

  private metricsPlan(): SemanticPlan {
    return {
      source: this.sourceIdentity,
      select: [
        {
          expr: { kind: 'aggregate', fn: this.aggregateFn, column: this.columnRef },
          alias: 'data',
        },
      ],
      filters: this.buildSemanticFilters(),
      tz: this.tzActive() ? this.timezone : undefined,
    };
  }

  /**
   * Generate the current metric plus its variation against the period
   * `previousCount` units ago.
   *
   * @param previousCount - How many periods back the comparison window sits (must be `> 0`).
   * @param previousPeriod - The period unit to step back by; one of {@link Period}'s day/week/month/year.
   * @param inPercent - When `true`, express the variation value as a percentage string.
   * @returns The current count plus a typed (`increase`/`decrease`/`none`) variation.
   * @throws {@link InvalidPeriodException} when `previousPeriod` is not a day/week/month/year period.
   * @throws {@link InvalidVariationsCountException} when `previousCount` is not greater than `0`.
   */
  async metricsWithVariations(
    previousCount: number,
    previousPeriod: Period,
    inPercent = false,
  ): Promise<VariationResult> {
    if (!VARIATION_PERIODS.includes(previousPeriod)) {
      throw new InvalidPeriodException(previousPeriod);
    }
    if (previousCount <= 0) {
      throw new InvalidVariationsCountException();
    }

    const previous = this.baseClone();
    previous.period = previousPeriod;
    previous.windowCount = previousCount;
    shiftReference(previous, previousPeriod, previousCount);

    const count = await this.metrics();
    const prior = await previous.metrics();

    const diff = count - prior;
    const type = diff > 0 ? 'increase' : diff < 0 ? 'decrease' : 'none';

    let value: number | string = Math.abs(diff);
    if (type !== 'none' && inPercent && prior > 0) {
      value = `${Math.round((Math.abs(diff) / prior) * 100 * 100) / 100}%`;
    }
    if (type === 'none') {
      value = 0;
    }

    return { count, variation: { type, value } };
  }

  /**
   * Execute the query and return a chart-ready time series. Returns a
   * {@link GroupedTrendsResult} when {@link groupData} was used, otherwise a
   * {@link TrendsResult}; both are empty when no rows match.
   *
   * @param inPercent - When `true`, convert each data point to its percentage of the series total.
   * @returns Parallel `labels`/`data` arrays ready to feed a chart.
   *
   * @example
   * ```ts
   * const { labels, data } = await Metrics.query(orderRepo.createQueryBuilder('order'))
   *   .countByMonth()
   *   .trends();
   * ```
   */
  async trends(inPercent = false): Promise<TrendsResult | GroupedTrendsResult> {
    if (this.groupedLabels !== null) {
      return this.groupedTrends(inPercent);
    }

    const rows = await this.trendsData();
    const formatter = new TrendsFormatter(new LabelFormatter(this.locale));
    const ctx = { year: this.year, month: this.month };

    let series: TrendsResult;
    if (this.fill && this.isPeriodMode()) {
      // Date periods: fill the integer buckets, then format the labels.
      series = formatter.format(gapFillRaw(rows, this.missingValue), this.period, ctx);
    } else {
      const labelPeriod = this.labelColumnRef || this.range ? null : this.period;
      series = formatter.format(rows, labelPeriod, ctx);
      if (this.fill) {
        series = populate(await this.canonicalLabels(), series, this.missingValue);
      }
    }

    if (this.cumulativeData) {
      series = this.applyCumulative(series);
    }

    return inPercent ? toPercent(series) : series;
  }

  /**
   * Two aligned trend series: the current time window and a shifted comparison
   * window side by side, sharing a single label axis.
   *
   * The comparison window runs the same aggregate, period, and window settings
   * but with the reference point shifted back by `previousCount` units of
   * `previousPeriod`. Labels are merged across both series so every label
   * appears once; gaps are filled with `0`.
   *
   * @param previousCount - How many periods back the comparison window sits (must be `> 0`).
   * @param previousPeriod - The period unit to step back by; one of the period enums.
   * @param inPercent - When `true`, convert each data point to its percentage of the series total.
   * @returns Two aligned data series with a shared label axis.
   * @throws {@link InvalidPeriodException} when `previousPeriod` is not a valid period.
   * @throws {@link InvalidVariationsCountException} when `previousCount` is not greater than `0`.
   */
  async trendsWithComparison(
    previousCount: number,
    previousPeriod: Period,
    inPercent = false,
  ): Promise<TrendsComparisonResult> {
    if (!VARIATION_PERIODS.includes(previousPeriod)) {
      throw new InvalidPeriodException(previousPeriod);
    }
    if (previousCount <= 0) {
      throw new InvalidVariationsCountException();
    }

    const previous = this.cloneWithTrendState();
    shiftReference(previous, previousPeriod, previousCount);

    const current = (await this.trends(inPercent)) as TrendsResult;
    const prior = (await previous.trends(inPercent)) as TrendsResult;

    return mergeTrends(current, prior);
  }

  /** Create a clone carrying all trend-relevant state from the current builder. */
  private cloneWithTrendState(): MetricsBuilder<T> {
    const clone = this.baseClone();
    clone.period = this.period;
    clone.windowCount = this.windowCount;
    clone.range = this.range;
    clone.groupBy = this.groupBy;
    clone.labelColumnRef = this.labelColumnRef;
    clone.fill = this.fill;
    clone.missingValue = this.missingValue;
    clone.missingLabels = [...this.missingLabels];
    clone.cumulativeData = this.cumulativeData;
    clone.groupedLabels = this.groupedLabels === null ? null : [...this.groupedLabels];
    clone.groupedAggregate = this.groupedAggregate;
    clone.year = this.year;
    clone.month = this.month;
    clone.day = this.day;
    clone.week = this.week;
    clone.hour = this.hour;
    return clone;
  }

  /**
   * Remove the cached entry for the current trends query shape. A harmless
   * no-op when caching is off, including in {@link fromRows} mode, where
   * caching is never available.
   */
  async invalidateTrends(): Promise<void> {
    if (this.rowsMode) {
      return;
    }
    await this.invalidateCache(this.trendsPlan());
  }

  /** True when grouping by a date period (not a categorical column or range). */
  private isPeriodMode(): boolean {
    return this.period !== null && !this.labelColumnRef && !this.range;
  }

  /** Canonical ordered labels for fillMissingData in range / categorical mode. */
  private async canonicalLabels(): Promise<(string | number)[]> {
    if (this.range) {
      return enumerateBuckets(this.range.start, this.range.end, this.groupBy);
    }
    // Categorical (labelColumn): explicit labels, else distinct values.
    if (this.missingLabels.length > 0) {
      return this.missingLabels;
    }
    // Only the where/whereIn scoping filters apply here (not the period
    // filters): the canonical label set must respect .where()/.whereIn()
    // visibility scoping, but should still span the full configured period
    // range for gap-filling.
    const plan: SemanticPlan = {
      source: this.sourceIdentity,
      select: [
        { expr: { kind: 'column', column: this.labelColumnRef as ColumnRef }, alias: 'label' },
      ],
      filters: this.scopeFilters(),
      distinct: true,
      orderByLabel: 'ASC',
    };
    const rows = await this.backend.run(plan);
    return rows.map((row) => normalizeLabel(row.label));
  }

  /**
   * Resolve group labels: return the explicit set when provided, or query
   * distinct values from the aggregate column when auto-discovery is enabled.
   * The result is stored back on the builder so subsequent calls are stable.
   *
   * The discovery query runs through the same `buildSemanticFilters()` as the
   * trends query itself, so the series set is scoped by the configured
   * period/range *and* by every `.where()`/`.whereIn()` filter — an
   * out-of-scope column value can never surface as a series label.
   */
  private async resolveGroupLabels(): Promise<(string | number)[]> {
    if (this.groupedLabels && this.groupedLabels.length > 0) {
      return this.groupedLabels;
    }
    const plan: SemanticPlan = {
      source: this.sourceIdentity,
      select: [{ expr: { kind: 'column', column: this.columnRef }, alias: 'label' }],
      filters: this.buildSemanticFilters(),
      distinct: true,
      orderByLabel: 'ASC',
      tz: this.tzActive() ? this.timezone : undefined,
    };
    const rows = await this.backend.run(plan);
    this.groupedLabels = rows.map((row) => normalizeLabel(row.label));
    return this.groupedLabels;
  }

  /** Build the multi-series GroupedTrendsResult for groupData(). */
  private async groupedTrends(inPercent: boolean): Promise<GroupedTrendsResult> {
    const labels = await this.resolveGroupLabels();
    const rows = await this.trendsData();
    const byLabel = new Map(rows.map((row) => [String(row.label), row]));
    const canonical = await this.groupedCanonical(rows);

    const labelFormatter = new LabelFormatter(this.locale);
    const ctx = { year: this.year, month: this.month };
    const labelPeriod = this.labelColumnRef || this.range ? null : this.period;
    const formattedLabels = canonical.map((label) => labelFormatter.format(label, labelPeriod, ctx));

    const seriesFor = (field: string): number[] =>
      canonical.map((label) => {
        const raw = byLabel.get(String(label));
        const row = isRecord(raw) ? raw : undefined;
        return row ? Number(row[field]) : this.missingValue;
      });

    const data: GroupedTrendsResult['data'] = { total: seriesFor('data') };
    labels.forEach((label, i) => {
      data[String(label)] = seriesFor(`data${i}`);
    });

    let result: GroupedTrendsResult = { labels: formattedLabels, data };

    if (this.cumulativeData) {
      result = this.groupedCumulative(result);
    }

    if (inPercent) {
      const pct: Record<string, number[]> = {};
      for (const [key, values] of Object.entries(result.data)) {
        pct[key] = percentArray(values);
      }
      result = { labels: result.labels, data: pct as GroupedTrendsResult['data'] };
    }

    return result;
  }

  private applyCumulative(result: TrendsResult): TrendsResult {
    let sum = 0;
    return { labels: result.labels, data: result.data.map((v) => (sum += v)) };
  }

  private groupedCumulative(result: GroupedTrendsResult): GroupedTrendsResult {
    const data: Record<string, number[]> = {};
    for (const [key, values] of Object.entries(result.data)) {
      let sum = 0;
      data[key] = values.map((v) => (sum += v));
    }
    return { labels: result.labels, data: data as GroupedTrendsResult['data'] };
  }

  /** Canonical raw labels (shared by every series) for grouped trends. */
  private async groupedCanonical(rows: RawTrendRow[]): Promise<(string | number)[]> {
    if (!this.fill) {
      return rows.map((row) => normalizeLabel(row.label));
    }
    if (this.range || this.labelColumnRef) {
      return this.canonicalLabels();
    }
    // Date period: integer buckets from the smallest to the largest present.
    return presentIntegerLabels(rows);
  }

  private async trendsData(): Promise<RawTrendRow[]> {
    const plan = this.trendsPlan();
    const rows = await this.withCache(plan, () => this.backend.run(plan));
    return rows.map(toTrendRow);
  }

  private trendsPlan(): SemanticPlan {
    const select: SemanticSelectItem[] = [
      {
        expr: { kind: 'aggregate', fn: this.aggregateFn, column: this.columnRef },
        alias: 'data',
      },
      { expr: this.semanticLabelExpr(), alias: 'label' },
    ];
    this.appendGroupedData(select);

    return {
      source: this.sourceIdentity,
      select,
      filters: this.buildSemanticFilters(),
      groupByLabel: true,
      orderByLabel: 'ASC',
      tz: this.tzActive() ? this.timezone : undefined,
    };
  }

  /**
   * Add one CASE-based aggregate per group label, so each trend row carries a
   * `data{i}` column with the per-group value. Group values are bound as
   * parameters by the renderer (never interpolated).
   */
  private appendGroupedData(select: SemanticSelectItem[]): void {
    const labels = this.groupedLabels ?? [];
    labels.forEach((value, i) => {
      select.push({
        expr: {
          kind: 'groupedAggregate',
          fn: this.groupedAggregate,
          column: this.columnRef,
          value,
          index: i,
        },
        alias: `data${i}`,
      });
    });
  }

  /** The expression used as the grouped trend label. */
  private semanticLabelExpr(): SelectExpr {
    if (this.labelColumnRef) {
      return { kind: 'column', column: this.labelColumnRef };
    }
    if (this.range) {
      return { kind: 'bucket', part: this.groupBy, date: this.dateColumnName };
    }
    if (this.period) {
      return { kind: 'period', part: PERIOD_TO_DATE_PART[this.period], date: this.dateColumnName };
    }
    return { kind: 'date', date: this.dateColumnName };
  }

  /** Whether a non-UTC timezone is configured. */
  private tzActive(): boolean {
    return this.timezone !== DEFAULT_TIMEZONE;
  }

  /** The `.where()`/`.whereIn()` scoping filters on their own (no period). */
  private scopeFilters(): Filter[] {
    return this.extraWhere.map((w) => ({ kind: 'where' as const, ...w }));
  }

  /**
   * Build the filters that scope the query to the configured period/range,
   * plus every structured where/whereIn condition.
   */
  private buildSemanticFilters(): Filter[] {
    const filters: Filter[] = [];
    if (this.range) {
      filters.push({
        kind: 'dateBetween',
        start: this.range.start,
        end: this.range.end,
        date: this.dateColumnName,
      });
    } else {
      switch (this.period) {
        case Period.HOUR:
          this.eqFilter(filters, 'year', this.year);
          this.eqFilter(filters, 'month', this.month);
          this.eqFilter(filters, 'day', this.day);
          this.windowFilter(filters, 'hour', this.hour, () => this.resolver().hourPeriod());
          break;
        case Period.DAY:
          this.eqFilter(filters, 'year', this.year);
          this.eqFilter(filters, 'month', this.month);
          this.windowFilter(filters, 'day', this.day, () => this.resolver().dayPeriod());
          break;
        case Period.WEEK:
          this.eqFilter(filters, 'year', this.year);
          this.eqFilter(filters, 'month', this.month);
          this.windowFilter(filters, 'week', this.week, () => this.resolver().weekPeriod());
          break;
        case Period.MONTH:
          this.eqFilter(filters, 'year', this.year);
          this.windowFilter(filters, 'month', this.month, () => this.resolver().monthPeriod());
          break;
        case Period.YEAR:
          this.windowFilter(filters, 'year', this.year, () => [
            this.year - this.windowCount,
            this.year,
          ]);
          break;
      }
    }
    filters.push(...this.scopeFilters());
    return filters;
  }

  private windowFilter(
    filters: Filter[],
    part: DatePart,
    single: number,
    window: () => [number, number],
  ): void {
    if (this.windowCount === 1) {
      this.eqFilter(filters, part, single);
    } else if (this.windowCount > 1) {
      const [start, end] = window();
      filters.push({ kind: 'periodBetween', part, start, end, date: this.dateColumnName });
    }
  }

  private eqFilter(filters: Filter[], part: DatePart, value: number): void {
    filters.push({ kind: 'periodEq', part, value, date: this.dateColumnName });
  }

  private resolver(): PeriodResolver {
    return new PeriodResolver(
      { year: this.year, month: this.month, day: this.day, week: this.week, hour: this.hour },
      this.windowCount,
    );
  }

  /**
   * Execute the callback, returning a cached value when available for the
   * given query plan. A no-op when caching is not enabled on this builder.
   */
  private async withCache<R>(plan: SemanticPlan, execute: () => Promise<R>): Promise<R> {
    if (!this.caching || !this.cacheStore) {
      return execute();
    }
    const key = planCacheKey(plan, this.caching.keyPrefix);
    const cached = await this.cacheStore.get<R>(key);
    if (cached !== undefined) {
      this.logCache('hit', key);
      return cached;
    }
    this.logCache('miss', key);
    const result = await execute();
    await this.cacheStore.set(key, result, this.caching.ttl);
    this.logCache('set', key);
    return result;
  }

  private async invalidateCache(plan: SemanticPlan): Promise<void> {
    if (!this.caching || !this.cacheStore) {
      return;
    }
    const key = planCacheKey(plan, this.caching.keyPrefix);
    await this.cacheStore.del(key);
    this.logCache('delete', key);
  }

  private logCache(type: 'hit' | 'miss' | 'set' | 'delete', key: string): void {
    this.caching?.logger?.({ type, key });
  }
}

function today(): string {
  // Local date, matching the local-time basis used for the period reference.
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const VARIATION_PERIODS: Period[] = [Period.HOUR, Period.DAY, Period.WEEK, Period.MONTH, Period.YEAR];

/** Pin a builder's reference point to `count` periods before now. */
function shiftReference<T extends ObjectLiteral>(
  builder: MetricsBuilder<T>,
  period: Period,
  count: number,
): void {
  const ago = DateTime.now();
  switch (period) {
    case Period.HOUR:
      builder.forHour(ago.minus({ hours: count }).hour);
      break;
    case Period.DAY:
      builder.forDay(ago.minus({ days: count }).day);
      break;
    case Period.WEEK:
      builder.forWeek(ago.minus({ weeks: count }).weekNumber);
      break;
    case Period.MONTH:
      builder.forMonth(ago.minus({ months: count }).month);
      break;
    case Period.YEAR:
      builder.forYear(ago.minus({ years: count }).year);
      break;
  }
}

/**
 * Merge two trend series onto a shared, sorted label axis. Labels that appear
 * in only one series get `0` in the other.
 */
function mergeTrends(current: TrendsResult, prior: TrendsResult): TrendsComparisonResult {
  const allLabels = new Set<(string | number)>();
  current.labels.forEach((l) => allLabels.add(l));
  prior.labels.forEach((l) => allLabels.add(l));

  const sortedLabels = [...allLabels].sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  });

  const curMap = new Map<string, number>();
  current.labels.forEach((l, i) => curMap.set(String(l), current.data[i]));

  const prevMap = new Map<string, number>();
  prior.labels.forEach((l, i) => prevMap.set(String(l), prior.data[i]));

  return {
    labels: sortedLabels,
    current: sortedLabels.map((l) => curMap.get(String(l)) ?? 0),
    previous: sortedLabels.map((l) => prevMap.get(String(l)) ?? 0),
  };
}

/** ISO-8601 week number for a JS Date (matches Luxon/Postgres/MySQL/SQLite). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
