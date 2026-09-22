import type { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { Row } from '../datasource';
import { registerSqliteTz, BetterSqlite3Db } from '../dates/sqlite-tz';
import { dialectFor } from '../dialects/dialect.factory';
import { SqlDialect } from '../dialects/sql-dialect.interface';
import { QueryBackend } from './query-backend.interface';
import { renderPlan } from './render-plan';
import { SemanticPlan } from './semantic-plan';

/**
 * Renders a QueryPlan onto a cloned TypeORM SelectQueryBuilder, preserving the
 * driver's own identifier escaping and parameter binding. This is the original,
 * proven execution path — unchanged in behavior, now behind the backend seam.
 */
export class TypeOrmBackend<T extends ObjectLiteral> implements QueryBackend {
  private readonly dialect: SqlDialect;

  constructor(private readonly qb: SelectQueryBuilder<T>) {
    this.dialect = dialectFor(qb.connection.options.type);
  }

  async run(plan: SemanticPlan): Promise<Row[]> {
    const rendered = renderPlan(plan, this.dialect, (name) => this.qb.connection.driver.escape(name));
    const q = this.qb.clone();
    rendered.select.forEach((item, i) => {
      if (i === 0) {
        q.select(item.expr, item.alias);
      } else {
        q.addSelect(item.expr, item.alias);
      }
    });
    if (rendered.distinct) {
      q.distinct(true);
    }
    for (const fragment of rendered.where) {
      q.andWhere(fragment);
    }
    q.setParameters(rendered.params);
    if (rendered.groupBy) {
      q.groupBy(rendered.groupBy);
    }
    if (rendered.orderBy) {
      q.orderBy(rendered.orderBy.expr, rendered.orderBy.dir);
    }
    if (rendered.tz) {
      this.registerTz();
    }
    return q.getRawMany<Row>();
  }

  /** Bind the SQLite tz user-function when bucketing in a non-UTC timezone. */
  private registerTz(): void {
    const driver = this.qb.connection.driver as { databaseConnection?: unknown };
    if (this.qb.connection.options.type === 'better-sqlite3' && driver.databaseConnection) {
      registerSqliteTz(driver.databaseConnection as BetterSqlite3Db);
    }
  }
}
