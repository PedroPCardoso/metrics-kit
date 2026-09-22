/** A bound value usable in a structured where condition. */
export type WhereScalar = string | number | boolean | null;

/** Range comparisons against a column. */
export interface RangeCondition {
  gte?: WhereScalar;
  lte?: WhereScalar;
  gt?: WhereScalar;
  lt?: WhereScalar;
}

/** Equality (scalar), membership (array → IN), or range (object). */
export type WhereCondition = WhereScalar | WhereScalar[] | RangeCondition;

/** Structured filter map: column → condition, ANDed together. */
export type WhereInput = Record<string, WhereCondition>;

export interface CompiledWhere {
  fragments: string[];
  params: Record<string, unknown>;
}

const RANGE_OPS: [keyof RangeCondition, string][] = [
  ['gte', '>='],
  ['lte', '<='],
  ['gt', '>'],
  ['lt', '<'],
];

/**
 * Shared compilation grammar: a list of already-qualified column labels paired
 * with their condition, compiled into SQL fragments + bound parameters (one
 * `nm_w*` counter across the whole entry list). Both `compileWhere` (keyed by
 * plain column name) and `render-plan.ts`'s `compileWhereOrdered` (keyed by
 * per-entry `ColumnRef`, so a column can repeat with a different table) adapt
 * their input into this shape and call it, so there is exactly one
 * implementation of the null/array/range/scalar grammar.
 */
export function compileWhereEntries(entries: [string, WhereCondition][]): CompiledWhere {
  const fragments: string[] = [];
  const params: Record<string, unknown> = {};
  let next = 0;
  const bind = (value: unknown): string => {
    const key = `nm_w${next++}`;
    params[key] = value;
    return `:${key}`;
  };

  for (const [col, condition] of entries) {
    if (condition === null) {
      fragments.push(`${col} IS NULL`);
    } else if (Array.isArray(condition)) {
      if (condition.length === 0) {
        fragments.push('1 = 0'); // empty IN () matches nothing
      } else {
        fragments.push(`${col} IN (${condition.map((value) => bind(value)).join(', ')})`);
      }
    } else if (isRange(condition)) {
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

/**
 * Compile a structured where map into SQL fragments + bound parameters. Column
 * names are qualified through `qualify` (which validates + escapes them — the
 * injection choke point); every value flows only as a `:param`.
 */
export function compileWhere(where: WhereInput, qualify: (column: string) => string): CompiledWhere {
  const entries: [string, WhereCondition][] = Object.entries(where).map(([column, condition]) => [
    qualify(column),
    condition,
  ]);
  return compileWhereEntries(entries);
}

function isRange(condition: WhereCondition): condition is RangeCondition {
  return typeof condition === 'object' && condition !== null && !Array.isArray(condition);
}
