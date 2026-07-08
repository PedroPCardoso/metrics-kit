import {
  MetricsBuilder,
  type CacheStore,
  type ExecutorSpec,
  type MetricsOptions,
  type Row,
  type SupportedDialect,
} from 'nestjs-metrics-core';

/**
 * The slice of a Kysely instance we use: `executeQuery` runs a compiled query
 * and returns typed rows. Duck-typed so this package never imports `kysely`
 * directly (it stays an optional peer; users pass their own generated client).
 */
export interface KyselyClientLike {
  executeQuery<R>(compiledQuery: {
    sql: string;
    parameters: readonly unknown[];
    query: unknown;
    executionType: string;
  }): Promise<{ rows: R[] }>;
}

export interface KyselyMetricsSpec extends ExecutorSpec {
  /** Kysely cannot report its dialect at runtime — state it explicitly. */
  dialect: SupportedDialect;
}

/**
 * Build a metrics query over a Kysely database client. The emitted SQL runs
 * through `executeQuery`; values are bound positionally by the core executor.
 *
 * @param db - A Kysely instance (or anything exposing `executeQuery`).
 * @param spec - Source table/columns plus the explicit `dialect`.
 * @param options - Locale, timezone and cache options for the query.
 * @returns A metrics builder ready for chaining.
 *
 * @example
 * ```ts
 * import { Kysely, PostgresDialect } from 'kysely';
 * import { kyselyMetrics } from 'nextjs-metrics/kysely';
 *
 * const db = new Kysely<DB>({ dialect: new PostgresDialect({ pool }) });
 *
 * const series = await kyselyMetrics(db, {
 *   table: 'orders',
 *   dateColumn: 'created_at',
 *   dialect: 'postgres',
 * })
 *   .sumByMonth('amount', 3)
 *   .trends();
 * ```
 */
export function kyselyMetrics(
  db: KyselyClientLike,
  spec: KyselyMetricsSpec,
  options?: MetricsOptions,
  cacheStore?: CacheStore,
): MetricsBuilder<Record<string, unknown>> {
  const { dialect, ...source } = spec;
  return MetricsBuilder.queryExecutor<Record<string, unknown>>(
    {
      dialect,
      execute: async (sql, params) => {
        const result = await db.executeQuery<Row>({
          sql,
          parameters: params,
          query: { kind: 'RawNode' },
          executionType: 'raw',
        });
        return result.rows;
      },
    },
    source,
    options,
    cacheStore,
  );
}
