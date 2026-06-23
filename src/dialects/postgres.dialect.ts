import { Aggregate } from '../enums/aggregate.enum';
import { DatePart, SqlDialect } from './sql-dialect.interface';

export class PostgresDialect implements SqlDialect {
  aggregate(fn: Aggregate, column: string): string {
    return `${fn}(${column})`;
  }

  periodExpr(part: DatePart, column: string): string {
    switch (part) {
      case 'day':
        return `EXTRACT(DAY FROM ${column})`;
      case 'week':
        // EXTRACT(WEEK ...) is already the ISO-8601 week number in Postgres.
        return `EXTRACT(WEEK FROM ${column})`;
      case 'month':
        return `EXTRACT(MONTH FROM ${column})`;
      case 'year':
        return `EXTRACT(YEAR FROM ${column})`;
    }
  }
}
