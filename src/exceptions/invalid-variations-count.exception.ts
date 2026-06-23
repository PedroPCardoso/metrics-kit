export class InvalidVariationsCountException extends Error {
  constructor() {
    super('nestjs-metrics: the variations count must be greater than 0');
    this.name = 'InvalidVariationsCountException';
  }
}
