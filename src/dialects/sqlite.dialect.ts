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
        return `CAST(strftime('%W', ${column}) AS INTEGER)`;
      case 'month':
        return `CAST(strftime('%m', ${column}) AS INTEGER)`;
      case 'year':
        return `CAST(strftime('%Y', ${column}) AS INTEGER)`;
    }
  }
}
