import { Row } from '../datasource';
import { SqlDialect } from '../dialects/sql-dialect.interface';
import { SemanticPlan } from './semantic-plan';

/**
 * Executes a SemanticPlan against a concrete data layer. The builder assembles
 * the plan once (period filters, aggregates, labels), staying SQL-free; each
 * backend renders it for its driver and runs it. Implementations: TypeORM
 * (SelectQueryBuilder), the raw-SQL executor (Prisma/Drizzle/…) and the
 * in-memory rows backend.
 */
export interface QueryBackend {
  /**
   * The SQL dialect this backend renders for. Absent on the rows backend,
   * which never produces SQL.
   */
  readonly dialect?: SqlDialect;
  /**
   * Quote a pre-validated identifier for this backend. SQL backends hand this
   * to `renderPlan()`; the rows backend has no SQL identifiers to quote.
   */
  escapeId(name: string): string;
  run(plan: SemanticPlan): Promise<Row[]>;
  /**
   * Render the plan as a SQL string for preview/debugging. Throws in rows
   * mode, where there is no SQL to show.
   */
  toSql(plan: SemanticPlan, mask?: boolean): string;
}
