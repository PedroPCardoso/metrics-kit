import { DateTime } from 'luxon';
import { Row } from '../datasource';
import { Aggregate } from '../enums/aggregate.enum';
import { DatePart } from '../dialects/sql-dialect.interface';
import { InvalidRowDateException } from '../exceptions/invalid-row-date.exception';
import { UnsupportedInRowsModeException } from '../exceptions/unsupported-in-rows-mode.exception';
import { WhereCondition, RangeCondition } from '../where';
import { QueryBackend } from './query-backend.interface';
import { Filter, SelectExpr, SemanticPlan } from './semantic-plan';

type SourceRow = Record<string, unknown>;

/**
 * Interprets a SemanticPlan over an in-memory row array. Same observable
 * semantics as the SQL backends: identical period extraction (ISO weeks),
 * identical where semantics (empty IN matches nothing), timezone-aware
 * bucketing via Luxon. Column refs resolve by bare column name; the table
 * part is irrelevant for rows.
 */
export class RowsBackend implements QueryBackend {
  constructor(private readonly rows: SourceRow[]) {}

  /**
   * Rows are addressed by bare property name, so there is nothing to quote:
   * the identity is the honest implementation, not a stub. Identifiers are
   * still validated upstream (assertSafeIdentifier) as in the SQL modes.
   */
  escapeId(name: string): string {
    return name;
  }

  /** There is no SQL behind a rows-mode builder; a synthesized string would lie. */
  toSql(): string {
    throw new UnsupportedInRowsModeException('toSql');
  }

  async run(plan: SemanticPlan): Promise<Row[]> {
    const zone = plan.tz ?? 'UTC';
    const kept: Array<[SourceRow, number]> = this.rows
      .map((row, index): [SourceRow, number] => [row, index])
      .filter(([row, index]) => plan.filters.every((filter) => this.matches(filter, row, index, zone)));

    const labelItem = plan.select.find((item) => item.alias === 'label');

    if (plan.distinct && labelItem) {
      const values = new Set<string | number>();
      kept.forEach(([row, index]) => values.add(this.evalLabel(labelItem.expr, row, index, zone)));
      const sorted = [...values].sort(compareLabels);
      return sorted.map((label) => ({ label }));
    }

    const groups = new Map<string | number, SourceRow[]>();
    if (labelItem && plan.groupByLabel) {
      kept.forEach(([row, index]) => {
        const label = this.evalLabel(labelItem.expr, row, index, zone);
        const bucket = groups.get(label);
        if (bucket) {
          bucket.push(row);
        } else {
          groups.set(label, [row]);
        }
      });
    } else {
      groups.set(
        '',
        kept.map(([row]) => row),
      );
    }

    const entries = [...groups.entries()];
    if (plan.orderByLabel) {
      entries.sort(([a], [b]) => compareLabels(a, b) * (plan.orderByLabel === 'DESC' ? -1 : 1));
    }

    return entries.map(([label, groupRows]) => {
      const out: Row = {};
      for (const item of plan.select) {
        if (item.alias === 'label') {
          out.label = label;
        } else {
          out[item.alias] = this.evalAggregate(item.expr, groupRows);
        }
      }
      return out;
    });
  }

  // --- date handling --------------------------------------------------------

  private toDateTime(row: SourceRow, column: string, index: number, zone: string): DateTime {
    const value = row[column];
    let dt: DateTime;
    if (value instanceof Date) {
      dt = DateTime.fromJSDate(value);
    } else if (typeof value === 'number') {
      dt = DateTime.fromMillis(value);
    } else if (typeof value === 'string') {
      dt = DateTime.fromISO(value, { zone: 'utc' });
      if (!dt.isValid) {
        dt = DateTime.fromSQL(value, { zone: 'utc' });
      }
    } else {
      dt = DateTime.invalid('unsupported type');
    }
    if (!dt.isValid) {
      throw new InvalidRowDateException(index, value);
    }
    return dt.setZone(zone);
  }

  private periodValue(part: DatePart, dt: DateTime): number {
    switch (part) {
      case 'hour':
        return dt.hour;
      case 'day':
        return dt.day;
      case 'week':
        return dt.weekNumber;
      case 'month':
        return dt.month;
      case 'year':
        return dt.year;
    }
  }

  private bucketValue(part: DatePart, dt: DateTime): string {
    switch (part) {
      // Mirrors the SQL dialects' hour bucket format (`YYYY-MM-DD HH24:00`).
      case 'hour':
        return dt.toFormat('yyyy-MM-dd HH:00');
      case 'day':
        return dt.toFormat('yyyy-MM-dd');
      case 'week':
        return `${dt.weekYear}-W${String(dt.weekNumber).padStart(2, '0')}`;
      case 'month':
        return dt.toFormat('yyyy-MM');
      case 'year':
        return dt.toFormat('yyyy');
    }
  }

  // --- filters --------------------------------------------------------------

  private matches(filter: Filter, row: SourceRow, index: number, zone: string): boolean {
    switch (filter.kind) {
      case 'periodEq':
        return (
          this.periodValue(filter.part, this.toDateTime(row, filter.date.column, index, zone)) ===
          filter.value
        );
      case 'periodBetween': {
        const value = this.periodValue(
          filter.part,
          this.toDateTime(row, filter.date.column, index, zone),
        );
        return value >= filter.start && value <= filter.end;
      }
      case 'dateBetween': {
        const day = this.bucketValue('day', this.toDateTime(row, filter.date.column, index, zone));
        return day >= filter.start && day <= filter.end;
      }
      case 'where':
        return matchCondition(row[filter.column.column], filter.condition);
    }
  }

  // --- select ---------------------------------------------------------------

  private evalLabel(expr: SelectExpr, row: SourceRow, index: number, zone: string): string | number {
    switch (expr.kind) {
      case 'period':
        return this.periodValue(expr.part, this.toDateTime(row, expr.date.column, index, zone));
      case 'bucket':
        return this.bucketValue(expr.part, this.toDateTime(row, expr.date.column, index, zone));
      case 'column': {
        const value = row[expr.column.column];
        return typeof value === 'number' ? value : String(value);
      }
      case 'date':
        return this.bucketValue('day', this.toDateTime(row, expr.date.column, index, zone));
      default:
        throw new Error(`nestjs-metrics: '${expr.kind}' cannot be used as a label`);
    }
  }

  private evalAggregate(expr: SelectExpr, rows: SourceRow[]): number | string {
    if (expr.kind === 'aggregate') {
      return aggregate(expr.fn, rows.map((row) => row[expr.column.column]));
    }
    if (expr.kind === 'groupedAggregate') {
      return aggregate(
        expr.fn,
        rows.map((row) => (looseEquals(row[expr.column.column], expr.value) ? 1 : 0)),
      );
    }
    throw new Error(`nestjs-metrics: '${expr.kind}' is not an aggregate expression`);
  }
}

/** SQL-style aggregate over raw values; nulls/undefined are ignored like SQL. */
function aggregate(fn: Aggregate, values: unknown[]): number | string {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (fn === Aggregate.COUNT) {
    return present.length;
  }
  if (fn === Aggregate.COUNT_DISTINCT) {
    // SQL compares distinct values by value; normalize through String() so a
    // driver returning 1 and '1' counts once, matching looseEquals elsewhere.
    return new Set(present.map((value) => String(value))).size;
  }
  if (fn === Aggregate.MAX || fn === Aggregate.MIN) {
    if (present.length === 0) {
      return 0;
    }
    // Like SQL: compare numerically only when every value is genuinely
    // numeric; otherwise fall back to native (string/date) comparison so
    // MAX/MIN over non-numeric columns returns the real extreme, not 0.
    if (present.every(isNumericLike)) {
      const nums = present.map(Number);
      return fn === Aggregate.MAX ? Math.max(...nums) : Math.min(...nums);
    }
    const strs = present.map(String).sort();
    return fn === Aggregate.MAX ? strs[strs.length - 1] : strs[0];
  }
  const nums = present.map(Number).filter((n) => !Number.isNaN(n));
  if (nums.length === 0) {
    return 0;
  }
  switch (fn) {
    case Aggregate.SUM:
      return nums.reduce((a, b) => a + b, 0);
    case Aggregate.AVERAGE:
      return nums.reduce((a, b) => a + b, 0) / nums.length;
    default:
      return 0;
  }
}

/** True when a value is a finite number, or a non-empty string that parses as one. */
function isNumericLike(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value);
  }
  if (typeof value === 'string') {
    return value.trim() !== '' && Number.isFinite(Number(value));
  }
  return false;
}

/**
 * Compare two range-condition operands the way SQL would: numerically when
 * both sides are genuinely numeric, otherwise as strings (covers ISO date
 * strings and text columns like SQL's native `>=`/`<=`).
 */
function compareRangeValues(a: unknown, b: unknown): number {
  if (isNumericLike(a) && isNumericLike(b)) {
    return Number(a) - Number(b);
  }
  const as = String(a);
  const bs = String(b);
  return as < bs ? -1 : as > bs ? 1 : 0;
}

/** SQL-style loose equality: 1 matches '1' (drivers return both). */
function looseEquals(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }
  return a === b || String(a) === String(b);
}

/** Same semantics as compileWhere: null → IS NULL, array → IN, object → range. */
function matchCondition(value: unknown, condition: WhereCondition): boolean {
  if (condition === null) {
    return value === null;
  }
  if (Array.isArray(condition)) {
    return condition.some((candidate) => looseEquals(value, candidate));
  }
  if (typeof condition === 'object') {
    const range = condition as RangeCondition;
    if (
      range.gte === undefined &&
      range.lte === undefined &&
      range.gt === undefined &&
      range.lt === undefined
    ) {
      // Empty range object: no WHERE fragment in SQL, so it matches everything.
      return true;
    }
    if (value === null || value === undefined) {
      // SQL: `NULL >= x` (and friends) is never true.
      return false;
    }
    if (range.gte !== undefined && !(compareRangeValues(value, range.gte) >= 0)) return false;
    if (range.lte !== undefined && !(compareRangeValues(value, range.lte) <= 0)) return false;
    if (range.gt !== undefined && !(compareRangeValues(value, range.gt) > 0)) return false;
    if (range.lt !== undefined && !(compareRangeValues(value, range.lt) < 0)) return false;
    return true;
  }
  return looseEquals(value, condition);
}

/** Numeric-aware label ordering (integer period buckets sort numerically). */
function compareLabels(a: string | number, b: string | number): number {
  if (typeof a === 'number' && typeof b === 'number') {
    return a - b;
  }
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
