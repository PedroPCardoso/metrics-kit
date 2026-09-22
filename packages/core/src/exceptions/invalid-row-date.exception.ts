import { MetricsError } from './metrics.error';

/** A fromRows() row carried a date value Luxon could not parse. */
export class InvalidRowDateException extends MetricsError {
  constructor(rowIndex: number, value: unknown) {
    super(
      `nestjs-metrics: row ${rowIndex} has an unparseable date value: ${String(value)}`,
      'INVALID_ROW_DATE',
      { operation: 'fromRows', suggestion: 'Ensure every row\'s date column is a Date, ISO string, or epoch millisecond number.' },
    );
    this.name = 'InvalidRowDateException';
  }
}
