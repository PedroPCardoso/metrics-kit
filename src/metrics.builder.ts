import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Aggregate } from './enums/aggregate.enum';
import { Period } from './enums/period.enum';
import { dialectFor } from './dialects/dialect.factory';
import { DatePart, SqlDialect } from './dialects/sql-dialect.interface';
import { PeriodResolver } from './dates/period-resolver';
import { LabelFormatter } from './formatting/label-formatter';
import { RawTrendRow, TrendsFormatter } from './formatting/trends.formatter';
import { MetricsOptions, TrendsResult } from './types';

const DEFAULT_LOCALE = 'en';

/**
 * Fluent builder that turns a TypeORM SelectQueryBuilder into chart-ready
 * metrics and trends. The chain is synchronous; only the terminal methods
 * (metrics, trends) execute against the database and are async.
 */
export class MetricsBuilder<T extends ObjectLiteral> {
  private readonly table: string;
  private readonly dialect: SqlDialect;
  private readonly locale: string;
  private aggregateFn: Aggregate = Aggregate.COUNT;
  private column: string;
  private dateColumn: string;
  private period: Period | null = null;
  /** Window size for the period (0 = whole period). Named to avoid colliding with the count() aggregate method. */
  private windowCount = 0;
  private now = new Date();
  private year: number = this.now.getFullYear();
  private month: number = this.now.getMonth() + 1;
  private day: number = this.now.getDate();
  private week: number = isoWeek(this.now);

  constructor(
    private readonly qb: SelectQueryBuilder<T>,
    options: MetricsOptions = {},
  ) {
    this.table = qb.alias;
    this.dialect = dialectFor(qb.connection.options.type);
    this.locale = options.locale ?? DEFAULT_LOCALE;
    this.column = this.qualify('id');
    this.dateColumn = this.qualify('created_at');
  }

  /**
   * Single choke point that turns a bare column name into a table-qualified
   * identifier. Identifier-safety validation (issue #9) hooks in here so every
   * consumer-supplied identifier passes through exactly one place.
   */
  private qualify(column: string): string {
    return `${this.table}.${column}`;
  }

  static query<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    options?: MetricsOptions,
  ): MetricsBuilder<T> {
    return new MetricsBuilder(qb, options);
  }

  // --- Aggregates ---------------------------------------------------------

  private aggregate(fn: Aggregate, column: string): this {
    this.aggregateFn = fn;
    this.column = this.qualify(column);
    return this;
  }

  count(column = 'id'): this {
    return this.aggregate(Aggregate.COUNT, column);
  }

  sum(column: string): this {
    return this.aggregate(Aggregate.SUM, column);
  }

  average(column: string): this {
    return this.aggregate(Aggregate.AVERAGE, column);
  }

  max(column: string): this {
    return this.aggregate(Aggregate.MAX, column);
  }

  min(column: string): this {
    return this.aggregate(Aggregate.MIN, column);
  }

  // --- Periods ------------------------------------------------------------

  private by(period: Period, count = 0): this {
    this.period = period;
    this.windowCount = count;
    return this;
  }

  byDay(count = 0): this {
    return this.by(Period.DAY, count);
  }

  byWeek(count = 0): this {
    return this.by(Period.WEEK, count);
  }

  byMonth(count = 0): this {
    return this.by(Period.MONTH, count);
  }

  byYear(count = 0): this {
    return this.by(Period.YEAR, count);
  }

  // --- Reference point pinning -------------------------------------------

  forDay(day: number): this {
    this.day = day;
    return this;
  }

  forWeek(week: number): this {
    this.week = week;
    return this;
  }

  forMonth(month: number): this {
    this.month = month;
    return this;
  }

  forYear(year: number): this {
    this.year = year;
    return this;
  }

  // --- Combined shorthands ------------------------------------------------

  countByDay(column = 'id', count = 0): this {
    return this.count(column).byDay(count);
  }

  countByWeek(column = 'id', count = 0): this {
    return this.count(column).byWeek(count);
  }

  countByMonth(column = 'id', count = 0): this {
    return this.count(column).byMonth(count);
  }

  countByYear(column = 'id', count = 0): this {
    return this.count(column).byYear(count);
  }

  sumByDay(column: string, count = 0): this {
    return this.sum(column).byDay(count);
  }

  sumByWeek(column: string, count = 0): this {
    return this.sum(column).byWeek(count);
  }

  sumByMonth(column: string, count = 0): this {
    return this.sum(column).byMonth(count);
  }

  sumByYear(column: string, count = 0): this {
    return this.sum(column).byYear(count);
  }

  averageByDay(column: string, count = 0): this {
    return this.average(column).byDay(count);
  }

  averageByWeek(column: string, count = 0): this {
    return this.average(column).byWeek(count);
  }

  averageByMonth(column: string, count = 0): this {
    return this.average(column).byMonth(count);
  }

  averageByYear(column: string, count = 0): this {
    return this.average(column).byYear(count);
  }

  maxByDay(column: string, count = 0): this {
    return this.max(column).byDay(count);
  }

  maxByWeek(column: string, count = 0): this {
    return this.max(column).byWeek(count);
  }

  maxByMonth(column: string, count = 0): this {
    return this.max(column).byMonth(count);
  }

  maxByYear(column: string, count = 0): this {
    return this.max(column).byYear(count);
  }

  minByDay(column: string, count = 0): this {
    return this.min(column).byDay(count);
  }

  minByWeek(column: string, count = 0): this {
    return this.min(column).byWeek(count);
  }

  minByMonth(column: string, count = 0): this {
    return this.min(column).byMonth(count);
  }

  minByYear(column: string, count = 0): this {
    return this.min(column).byYear(count);
  }

  // --- Terminals ----------------------------------------------------------

  /** Generate a single aggregate value. Returns 0 when there is no data. */
  async metrics(): Promise<number> {
    const qb = this.qb.clone();
    qb.select(this.dialect.aggregate(this.aggregateFn, this.column), 'data');
    this.applyPeriod(qb);

    const raw = await qb.getRawOne<{ data: unknown }>();
    const data = raw?.data;
    return data === null || data === undefined ? 0 : Number(data);
  }

  /** Generate a chart-ready time series. Empty when there is no data. */
  async trends(inPercent = false): Promise<TrendsResult> {
    const rows = await this.trendsData();
    const formatter = new TrendsFormatter(new LabelFormatter(this.locale));
    return formatter.format(rows, this.period, { year: this.year, month: this.month }, inPercent);
  }

  private async trendsData(): Promise<RawTrendRow[]> {
    const qb = this.qb.clone();
    qb.select(this.dialect.aggregate(this.aggregateFn, this.column), 'data')
      .addSelect(this.labelExpr(), 'label')
      .groupBy('label')
      .orderBy('label', 'ASC');
    this.applyPeriod(qb);

    return qb.getRawMany<RawTrendRow>();
  }

  /** The SQL expression used as the grouped trend label for the current period. */
  private labelExpr(): string {
    const part = this.period as Exclude<Period, Period.TODAY> | null;
    if (part === null) {
      return this.dateColumn;
    }
    return this.dialect.periodExpr(part as DatePart, this.dateColumn);
  }

  /** Apply the WHERE clauses that scope the query to the configured period/window. */
  private applyPeriod(qb: SelectQueryBuilder<T>): void {
    switch (this.period) {
      case Period.DAY:
        this.whereEquals(qb, 'year', this.year);
        this.whereEquals(qb, 'month', this.month);
        this.applyWindow(qb, 'day', this.day, () => this.resolver().dayPeriod());
        break;
      case Period.WEEK:
        this.whereEquals(qb, 'year', this.year);
        this.whereEquals(qb, 'month', this.month);
        this.applyWindow(qb, 'week', this.week, () => this.resolver().weekPeriod());
        break;
      case Period.MONTH:
        this.whereEquals(qb, 'year', this.year);
        this.applyWindow(qb, 'month', this.month, () => this.resolver().monthPeriod());
        break;
      case Period.YEAR:
        this.applyWindow(qb, 'year', this.year, () => [this.year - this.windowCount, this.year]);
        break;
    }
  }

  private applyWindow(
    qb: SelectQueryBuilder<T>,
    part: DatePart,
    single: number,
    window: () => [number, number],
  ): void {
    if (this.windowCount === 1) {
      this.whereEquals(qb, part, single);
    } else if (this.windowCount > 1) {
      this.whereBetween(qb, part, window());
    }
  }

  private whereEquals(qb: SelectQueryBuilder<T>, part: DatePart, value: number): void {
    const key = `nm_${part}`;
    qb.andWhere(`${this.dialect.periodExpr(part, this.dateColumn)} = :${key}`, { [key]: value });
  }

  private whereBetween(
    qb: SelectQueryBuilder<T>,
    part: DatePart,
    [start, end]: [number, number],
  ): void {
    const lo = `nm_${part}_lo`;
    const hi = `nm_${part}_hi`;
    qb.andWhere(`${this.dialect.periodExpr(part, this.dateColumn)} BETWEEN :${lo} AND :${hi}`, {
      [lo]: start,
      [hi]: end,
    });
  }

  private resolver(): PeriodResolver {
    return new PeriodResolver(
      { year: this.year, month: this.month, day: this.day, week: this.week },
      this.windowCount,
    );
  }
}

/** ISO-8601 week number for a JS Date (matches Luxon/Postgres/MySQL/SQLite). */
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}
