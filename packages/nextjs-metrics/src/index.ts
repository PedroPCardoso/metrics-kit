// The full engine + fluent API (re-exported from the core), plus the Prisma,
// Drizzle and Kysely adapters. drizzle-orm and kysely are never imported
// eagerly — a Prisma-only user never needs them installed.
export * from 'nestjs-metrics-core';

export { prismaMetrics } from './prisma';
export type { PrismaClientLike, PrismaMetricsSpec } from './prisma';

export { drizzleMetrics } from './drizzle';
export type { DrizzleClientLike, DrizzleMetricsSpec } from './drizzle';

export { kyselyMetrics } from './kysely';
export type { KyselyClientLike, KyselyMetricsSpec } from './kysely';
