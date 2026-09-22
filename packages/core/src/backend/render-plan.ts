import { SqlDialect } from '../dialects/sql-dialect.interface';
import { compileWhere, WhereInput } from '../where';
import { ColumnRef, SelectExpr, SemanticPlan } from './semantic-plan';
import { QueryPlan, SelectItem } from './query-plan';

/**
 * Render a SemanticPlan into the SQL QueryPlan the TypeORM/executor backends
 * execute. Output (SQL text and nm_* parameter names) is byte-identical to the
 * pre-refactor builder, so the SQL snapshot suites gate this function.
 */
export function renderPlan(
  plan: SemanticPlan,
  dialect: SqlDialect,
  escapeId: (name: string) => string,
): QueryPlan {
  const params: Record<string, unknown> = {};
  const qualify = (ref: ColumnRef): string => `${escapeId(ref.table)}.${escapeId(ref.column)}`;
  const dateExpr = (ref: ColumnRef): string =>
    plan.tz ? dialect.convertTz(qualify(ref), ':nm_tz') : qualify(ref);

  const renderSelect = (expr: SelectExpr): string => {
    switch (expr.kind) {
      case 'aggregate':
        return dialect.aggregate(expr.fn, qualify(expr.column));
      case 'groupedAggregate': {
        const key = `nm_g${expr.index}`;
        params[key] = expr.value;
        return `${expr.fn}(CASE WHEN ${qualify(expr.column)} = :${key} THEN 1 ELSE 0 END)`;
      }
      case 'period':
        return dialect.periodExpr(expr.part, dateExpr(expr.date));
      case 'bucket':
        return dialect.dateBucket(expr.part, dateExpr(expr.date));
      case 'column':
        return qualify(expr.column);
      case 'date':
        return dateExpr(expr.date);
    }
  };

  const select: SelectItem[] = plan.select.map((item) => ({
    expr: renderSelect(item.expr),
    alias: item.alias,
  }));

  const where: string[] = [];
  // Structured where filters share one nm_w counter, in filter order (legacy naming).
  const whereEntries: [ColumnRef, WhereInput[string]][] = [];
  for (const filter of plan.filters) {
    switch (filter.kind) {
      case 'periodEq': {
        const key = `nm_${filter.part}`;
        params[key] = filter.value;
        where.push(`${dialect.periodExpr(filter.part, dateExpr(filter.date))} = :${key}`);
        break;
      }
      case 'periodBetween': {
        const lo = `nm_${filter.part}_lo`;
        const hi = `nm_${filter.part}_hi`;
        params[lo] = filter.start;
        params[hi] = filter.end;
        where.push(
          `${dialect.periodExpr(filter.part, dateExpr(filter.date))} BETWEEN :${lo} AND :${hi}`,
        );
        break;
      }
      case 'dateBetween':
        params.nm_start = filter.start;
        params.nm_end = filter.end;
        where.push(`${dialect.dateBucket('day', dateExpr(filter.date))} BETWEEN :nm_start AND :nm_end`);
        break;
      case 'where':
        whereEntries.push([filter.column, filter.condition]);
        break;
    }
  }
  if (whereEntries.length > 0) {
    // compileWhere keys by column name; qualify per-entry to keep each ref's table.
    const compiled = compileWhereOrdered(whereEntries, qualify, Object.keys(params));
    where.push(...compiled.fragments);
    Object.assign(params, compiled.params);
  }

  if (plan.tz) {
    params.nm_tz = plan.tz;
  }

  return {
    select,
    where,
    groupBy: plan.groupByLabel ? 'label' : undefined,
    orderBy: plan.orderByLabel ? { expr: 'label', dir: plan.orderByLabel } : undefined,
    distinct: plan.distinct,
    params,
    tz: plan.tz,
  };
}

/**
 * compileWhere() takes a Record and can't repeat columns or carry per-entry
 * tables; this ordered variant reuses its fragment grammar 1:1 (same nm_w
 * numbering starting at 0) over an entry list.
 */
function compileWhereOrdered(
  entries: [ColumnRef, WhereInput[string]][],
  qualify: (ref: ColumnRef) => string,
  _reserved: string[],
): { fragments: string[]; params: Record<string, unknown> } {
  const fragments: string[] = [];
  const params: Record<string, unknown> = {};
  let next = 0;
  const bind = (value: unknown): string => {
    const key = `nm_w${next++}`;
    params[key] = value;
    return `:${key}`;
  };
  const RANGE_OPS: ['gte' | 'lte' | 'gt' | 'lt', string][] = [
    ['gte', '>='],
    ['lte', '<='],
    ['gt', '>'],
    ['lt', '<'],
  ];
  for (const [ref, condition] of entries) {
    const col = qualify(ref);
    if (condition === null) {
      fragments.push(`${col} IS NULL`);
    } else if (Array.isArray(condition)) {
      fragments.push(
        condition.length === 0 ? '1 = 0' : `${col} IN (${condition.map(bind).join(', ')})`,
      );
    } else if (typeof condition === 'object') {
      for (const [op, sql] of RANGE_OPS) {
        if (condition[op] !== undefined) {
          fragments.push(`${col} ${sql} ${bind(condition[op])}`);
        }
      }
    } else {
      fragments.push(`${col} = ${bind(condition)}`);
    }
  }
  return { fragments, params };
}
