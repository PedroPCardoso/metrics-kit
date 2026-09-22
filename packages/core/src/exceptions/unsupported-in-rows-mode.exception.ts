import { MetricsError } from './metrics.error';

/** A SQL-only builder setting was used on a fromRows() builder. */
export class UnsupportedInRowsModeException extends MetricsError {
  constructor(method: string) {
    super(
      `nestjs-metrics: ${method}() is not supported in fromRows() mode`,
      'UNSUPPORTED_IN_ROWS_MODE',
      { operation: 'fromRows', suggestion: `Remove the ${method}() call, or use query()/queryExecutor() instead of fromRows().` },
    );
    this.name = 'UnsupportedInRowsModeException';
  }
}
