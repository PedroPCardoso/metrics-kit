export { MetricsBuilder, MetricsBuilder as Metrics } from './metrics.builder';
export { Aggregate } from './enums/aggregate.enum';
export { Period } from './enums/period.enum';
export type { SqlDialect, DatePart } from './dialects/sql-dialect.interface';
export type {
  TrendsResult,
  GroupedTrendsResult,
  VariationResult,
  MetricsOptions,
} from './types';
export { InvalidPeriodException } from './exceptions/invalid-period.exception';
export { InvalidVariationsCountException } from './exceptions/invalid-variations-count.exception';
