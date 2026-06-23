import { Aggregate } from '../enums/aggregate.enum';
import { DatePart, SqlDialect } from './sql-dialect.interface';

export class SqliteDialect implements SqlDialect {
  aggregate(fn: Aggregate, column: string): string {
    return `${fn}(${column})`;
  }

  periodExpr(part: DatePart, column: string): string {
    switch (part) {
      case 'day':
        return `CAST(strftime('%d', ${column}) AS INTEGER)`;
      case 'week':
        // ISO-8601 week: the day-of-year of this week's Thursday, divided into
        // 7-day blocks. SQLite has no native ISO week, so compute it.
        return `CAST((CAST(strftime('%j', date(${column}, '-3 days', 'weekday 4')) AS INTEGER) - 1) / 7 + 1 AS INTEGER)`;
      case 'month':
        return `CAST(strftime('%m', ${column}) AS INTEGER)`;
      case 'year':
        return `CAST(strftime('%Y', ${column}) AS INTEGER)`;
    }
  }
}
