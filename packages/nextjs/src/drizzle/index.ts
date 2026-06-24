import {
  MetricsBuilder,
  type ExecutorSpec,
  type MetricsOptions,
  type Row,
  type SqlExecutor,
  type SupportedDialect,
} from '@metrics-kit/core';

/**
 * A Drizzle db exposes the underlying driver as `$client`. Duck-typed so this
 * package never imports `drizzle-orm` (it stays an optional peer). The raw SQL
 * the core emits is run through that driver, per dialect.
 */
export interface DrizzleClientLike {
  $client: unknown;
}

export interface DrizzleMetricsSpec extends ExecutorSpec {
  /** State the dialect explicitly (Drizzle's runtime shape is driver-specific). */
  dialect: SupportedDialect;
}

/** Build a metrics query over a Drizzle db (better-sqlite3 / node-postgres / mysql2). */
export function drizzleMetrics(
  db: DrizzleClientLike,
  spec: DrizzleMetricsSpec,
  options?: MetricsOptions,
): MetricsBuilder<Record<string, unknown>> {
  const { dialect, ...source } = spec;
  return MetricsBuilder.queryExecutor<Record<string, unknown>>(
    { dialect, execute: drizzleExecutor(dialect, db.$client) },
    source,
    options,
  );
}

function drizzleExecutor(dialect: SupportedDialect, client: unknown): SqlExecutor {
  if (dialect === 'sqlite') {
    const sqlite = client as { prepare(sql: string): { all(...params: unknown[]): unknown[] } };
    return async (sql, params) => sqlite.prepare(sql).all(...params) as Row[];
  }
  if (dialect === 'postgres') {
    const pg = client as { query(sql: string, params: unknown[]): Promise<{ rows: Row[] }> };
    return async (sql, params) => (await pg.query(sql, params)).rows;
  }
  const mysql = client as { query(sql: string, params: unknown[]): Promise<[Row[], unknown]> };
  return async (sql, params) => (await mysql.query(sql, params))[0];
}
