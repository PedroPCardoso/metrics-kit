import { Row } from '../datasource';
import { SemanticPlan } from './semantic-plan';

/**
 * Executes a SemanticPlan against a concrete data layer. The builder assembles
 * the plan once (period filters, aggregates, labels), staying SQL-free; each
 * backend renders it for its driver and runs it. Implementations: TypeORM
 * (SelectQueryBuilder) and the raw-SQL executor (Prisma/Drizzle/…).
 */
export interface QueryBackend {
  /** Quote a pre-validated identifier for this backend. */
  escapeId(name: string): string;
  run(plan: SemanticPlan): Promise<Row[]>;
}
