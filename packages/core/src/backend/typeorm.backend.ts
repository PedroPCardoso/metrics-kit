import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Row } from '../datasource';
import { registerSqliteTz, BetterSqlite3Db } from '../dates/sqlite-tz';
import { dialectFor } from '../dialects/dialect.factory';
import { SqlDialect } from '../dialects/sql-dialect.interface';
import { MetricsError } from '../exceptions/metrics.error';
import { QueryExecutionError } from '../exceptions/query-execution.exception';
import { QueryBackend } from './query-backend.interface';
import { QueryPlan } from './query-plan';
import { renderPlan } from './render-plan';
import { SemanticPlan } from './semantic-plan';

/**
 * Renders a SemanticPlan onto a cloned TypeORM SelectQueryBuilder, preserving
 * the driver's own identifier escaping and parameter binding. This is the
 * original, proven execution path — unchanged in behavior, now behind the
 * backend seam.
 */
export class TypeOrmBackend<T extends ObjectLiteral> implements QueryBackend {
  readonly dialect: SqlDialect;

  constructor(private readonly qb: SelectQueryBuilder<T>) {
    this.dialect = dialectFor(qb.connection.options.type);
  }

  escapeId(name: string): string {
    return this.qb.connection.driver.escape(name);
  }

  async run(plan: SemanticPlan): Promise<Row[]> {
    const rendered = this.render(plan);
    const q = this.buildQuery(rendered);
    if (rendered.tz) {
      this.registerTz();
    }
    try {
      return await q.getRawMany<Row>();
    } catch (err) {
      if (err instanceof MetricsError) {
        throw err;
      }
      throw new QueryExecutionError(err, {
        query: q.getSql(),
        params: rendered.params,
        dialect: this.qb.connection.options.type,
        operation: 'execute',
      });
    }
  }

  toSql(plan: SemanticPlan, mask = false): string {
    const q = this.buildQuery(this.render(plan));
    const sql = q.getSql();
    if (mask) {
      const params = q.getParameters() as Record<string, unknown>;
      return this.redactParams(sql, params);
    }
    return sql;
  }

  private render(plan: SemanticPlan): QueryPlan {
    return renderPlan(plan, this.dialect, (name) => this.escapeId(name));
  }

  private buildQuery(plan: QueryPlan): SelectQueryBuilder<T> {
    const q = this.qb.clone();
    plan.select.forEach((item, i) => {
      if (i === 0) {
        q.select(item.expr, item.alias);
      } else {
        q.addSelect(item.expr, item.alias);
      }
    });
    if (plan.distinct) {
      q.distinct(true);
    }
    for (const fragment of plan.where) {
      q.andWhere(fragment);
    }
    q.setParameters(plan.params);
    if (plan.groupBy) {
      q.groupBy(plan.groupBy);
    }
    if (plan.orderBy) {
      q.orderBy(plan.orderBy.expr, plan.orderBy.dir);
    }
    return q;
  }

  private redactParams(sql: string, params: Record<string, unknown>): string {
    return sql.replace(/:(\w+)/g, (_, name) => {
      const value = params[name];
      if (value === undefined) return `:${name}`;
      if (typeof value === 'number') return '0';
      return "'[REDACTED]'";
    });
  }

  /** Bind the SQLite tz user-function when bucketing in a non-UTC timezone. */
  private registerTz(): void {
    const driver = this.qb.connection.driver as { databaseConnection?: unknown };
    if (this.qb.connection.options.type === 'better-sqlite3' && driver.databaseConnection) {
      registerSqliteTz(driver.databaseConnection as BetterSqlite3Db);
    }
  }
}
