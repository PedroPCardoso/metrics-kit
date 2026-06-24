// Shared types for the Next.js / Node adapters. The ORM-specific entry points
// live under the isolated subpaths `@metrics-kit/nextjs/prisma` and
// `@metrics-kit/nextjs/drizzle`, so importing one never loads the other.
export type {
  SupportedDialect,
  ExecutorSpec,
  WhereInput,
  WhereCondition,
  RangeCondition,
  WhereScalar,
  MetricsOptions,
  TrendsResult,
  GroupedTrendsResult,
} from '@metrics-kit/core';
