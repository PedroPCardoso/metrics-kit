import { Aggregate } from '../enums/aggregate.enum';
import { DatePart, SqlDialect } from './sql-dialect.interface';

export class MssqlDialect implements SqlDialect {
  aggregate(fn: Aggregate, column: string): string {
    if (fn === Aggregate.COUNT_DISTINCT) {
      return `count(DISTINCT ${column})`;
    }
    return `${fn}(${column})`;
  }

  periodExpr(part: DatePart, column: string): string {
    switch (part) {
      case 'hour':
        return `DATEPART(hour, ${column})`;
      case 'day':
        return `DATEPART(day, ${column})`;
      case 'week':
        return `DATEPART(iso_week, ${column})`;
      case 'month':
        return `DATEPART(month, ${column})`;
      case 'year':
        return `DATEPART(year, ${column})`;
    }
  }

  dateBucket(part: DatePart, column: string): string {
    switch (part) {
      case 'hour':
        return `CONVERT(varchar(13), ${column}, 120) + ':00'`;
      case 'day':
        return `CONVERT(varchar(10), ${column}, 23)`;
      case 'month':
        return `CONVERT(varchar(7), ${column}, 120)`;
      case 'year':
        return `CONVERT(varchar(4), ${column}, 120)`;
      case 'week': {
        const isoYear = `DATEPART(year, DATEADD(day, 3 - DATEDIFF(day, '1900-01-01', ${column}) % 7, ${column}))`;
        return `CAST(${isoYear} AS VARCHAR(4)) + '-W' + RIGHT('0' + CAST(DATEPART(iso_week, ${column}) AS VARCHAR(2)), 2)`;
      }
    }
  }

  convertTz(column: string, tzParam: string): string {
    return `(${column}) AT TIME ZONE 'UTC' AT TIME ZONE ${tzParam}`;
  }

  escapeId(name: string): string {
    return `[${name.replace(/]/g, ']]')}]`;
  }

  placeholder(index: number): string {
    return `@p${index}`;
  }
}
