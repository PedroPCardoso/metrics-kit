import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Aggregate } from './enums/aggregate.enum';
import { Period } from './enums/period.enum';
import { dialectFor } from './dialects/dialect.factory';
import { SqlDialect } from './dialects/sql-dialect.interface';

/**
 * Fluent builder that turns a TypeORM SelectQueryBuilder into chart-ready
 * metrics and trends. The chain is synchronous; only the terminal methods
 * (metrics) execute against the database and are async.
 */
export class MetricsBuilder<T extends ObjectLiteral> {
  private readonly table: string;
  private readonly dialect: SqlDialect;
  private aggregateFn: Aggregate = Aggregate.COUNT;
  private column: string;
  private dateColumn: string;
  private period: Period | null = null;
  /** Window size for the period (0 = whole period). Named to avoid colliding with the count() aggregate method. */
  private windowCount = 0;
  private year: number = new Date().getFullYear();

  constructor(private readonly qb: SelectQueryBuilder<T>) {
    this.table = qb.alias;
    this.dialect = dialectFor(qb.connection.options.type);
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

  static query<T extends ObjectLiteral>(qb: SelectQueryBuilder<T>): MetricsBuilder<T> {
    return new MetricsBuilder(qb);
  }

  count(column = 'id'): this {
    this.aggregateFn = Aggregate.COUNT;
    this.column = this.qualify(column);
    return this;
  }

  byMonth(count = 0): this {
    this.period = Period.MONTH;
    this.windowCount = count;
    return this;
  }

  /** Generate a single aggregate value. Returns 0 when there is no data. */
  async metrics(): Promise<number> {
    const qb = this.qb.clone();
    qb.select(this.dialect.aggregate(this.aggregateFn, this.column), 'data');
    this.applyPeriod(qb);

    const raw = await qb.getRawOne<{ data: unknown }>();
    const data = raw?.data;
    return data === null || data === undefined ? 0 : Number(data);
  }

  private applyPeriod(qb: SelectQueryBuilder<T>): void {
    if (this.period === Period.MONTH) {
      qb.andWhere(`${this.dialect.periodExpr('year', this.dateColumn)} = :nm_year`, {
        nm_year: this.year,
      });
    }
  }
}
