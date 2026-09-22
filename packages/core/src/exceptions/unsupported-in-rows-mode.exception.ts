/** A SQL-only builder setting was used on a fromRows() builder. */
export class UnsupportedInRowsModeException extends Error {
  constructor(method: string) {
    super(`nestjs-metrics: ${method}() is not supported in fromRows() mode`);
    this.name = 'UnsupportedInRowsModeException';
  }
}
