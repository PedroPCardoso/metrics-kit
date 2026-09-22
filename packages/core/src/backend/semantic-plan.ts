import { Aggregate } from '../enums/aggregate.enum';
import { DatePart } from '../dialects/sql-dialect.interface';
import { WhereCondition } from '../where';

/**
 * A pre-validated (assertSafeIdentifier) but NOT escaped column reference.
 * The table is captured at the time the column is configured, so a later
 * .table() call does not retroactively re-qualify earlier columns (legacy
 * eager-qualification behavior, preserved).
 */
export interface ColumnRef {
  table: string;
  column: string;
}

/** A projected expression, described structurally instead of as SQL. */
export type SelectExpr =
  | { kind: 'aggregate'; fn: Aggregate; column: ColumnRef }
  /** groupData(): fn(CASE WHEN column = value THEN 1 ELSE 0 END) as data{index}. */
  | { kind: 'groupedAggregate'; fn: Aggregate; column: ColumnRef; value: string | number; index: number }
  /** Integer date-part extraction (trend label in period mode). */
  | { kind: 'period'; part: DatePart; date: ColumnRef }
  /** Sortable date-bucket string (trend label in range mode). */
  | { kind: 'bucket'; part: DatePart; date: ColumnRef }
  /** A raw column projection (labelColumn / distinct label discovery). */
  | { kind: 'column'; column: ColumnRef }
  /** The bare (tz-converted) date column. */
  | { kind: 'date'; date: ColumnRef };

export interface SemanticSelectItem {
  expr: SelectExpr;
  alias: string;
}

export type Filter =
  | { kind: 'periodEq'; part: DatePart; value: number; date: ColumnRef }
  | { kind: 'periodBetween'; part: DatePart; start: number; end: number; date: ColumnRef }
  | { kind: 'dateBetween'; start: string; end: string; date: ColumnRef }
  | { kind: 'where'; column: ColumnRef; condition: WhereCondition };

/**
 * A backend-neutral, SQL-free description of the query the builder wants to
 * run. SQL backends render it (render-plan.ts); the rows backend interprets it.
 */
export interface SemanticPlan {
  select: SemanticSelectItem[];
  filters: Filter[];
  groupByLabel?: boolean;
  orderByLabel?: 'ASC' | 'DESC';
  distinct?: boolean;
  /** The active non-UTC timezone, when one is configured (else undefined). */
  tz?: string;
}
