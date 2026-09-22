/** A fromRows() row carried a date value Luxon could not parse. */
export class InvalidRowDateException extends Error {
  constructor(rowIndex: number, value: unknown) {
    super(`nestjs-metrics: row ${rowIndex} has an unparseable date value: ${String(value)}`);
    this.name = 'InvalidRowDateException';
  }
}
