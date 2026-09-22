# Fluent `where` + rows-in mode (RowsBackend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add chainable `.where()`/`.whereIn()` (both modes) and a `MetricsBuilder.fromRows()` entry point with full API parity, backed by a semantic query plan interpreted in memory.

**Architecture:** The builder stops emitting SQL strings: terminals build a `SemanticPlan` (structured aggregates, period filters, structured where). A shared `renderPlan()` turns it into today's SQL `QueryPlan` for the TypeORM and executor backends — byte-identical SQL, same `nm_*` param names, guarded by the existing SQL snapshot suites. A new `RowsBackend` interprets the same `SemanticPlan` over an in-memory row array with Luxon (timezone-aware period extraction).

**Tech Stack:** TypeScript, Luxon, Vitest, TypeORM (one backend only), tsup. Monorepo: all work in `packages/core` except docs/changesets.

## Global Constraints

- All commands run **inside Docker**: prefix everything with `docker compose run --rm dev` (per CLAUDE.md; never run npm on the host).
- Existing SQL snapshot suites (`test/executor-sql.spec.ts`, `test/dialects-sql.spec.ts`) MUST pass **unchanged** — they are the refactor harness. Generated SQL and parameter names (`nm_year`, `nm_month_lo`, `nm_w0`, `nm_g0`, `nm_tz`, `nm_start`, `nm_end`) stay identical.
- Column/table identifiers keep passing through `assertSafeIdentifier` at the point of entry (the injection choke point); values only ever travel as bound parameters / structured conditions.
- Empty `IN` list ⇒ matches nothing (SQL: `1 = 0`; rows: `false`). Fail closed.
- Spec: `docs/superpowers/specs/2026-09-22-fluent-where-and-rows-backend-design.md`.
- Releases via Changesets; this work is a **minor** for `nestjs-metrics-core`, `nestjs-metrics`, `nextjs-metrics`.

---

### Task 1: Semantic plan types + `renderPlan()`

**Files:**
- Create: `packages/core/src/backend/semantic-plan.ts`
- Create: `packages/core/src/backend/render-plan.ts`
- Test: `test/render-plan.spec.ts`

**Interfaces:**
- Consumes: `SqlDialect` (existing), `Aggregate`, `DatePart`, `WhereCondition`/`compileWhere` from `where.ts`, `QueryPlan` (existing, unchanged).
- Produces: types `ColumnRef`, `SelectExpr`, `Filter`, `SemanticPlan`, `SemanticSelectItem`; function `renderPlan(plan: SemanticPlan, dialect: SqlDialect, escapeId: (name: string) => string): QueryPlan`. Later tasks import these exact names from `./semantic-plan` / `./render-plan`.

- [ ] **Step 1: Write the failing test**

```ts
// test/render-plan.spec.ts
import { describe, expect, it } from 'vitest';
import { renderPlan } from '@core/backend/render-plan';
import { SemanticPlan } from '@core/backend/semantic-plan';
import { dialectFor } from '@core/dialects/dialect.factory';
import { Aggregate } from '@core/enums/aggregate.enum';

const dialect = dialectFor('postgres');
const esc = (name: string) => dialect.escapeId(name);
const col = (column: string) => ({ table: 'orders', column });

describe('renderPlan', () => {
  it('renders an aggregate metric with period filters (matches legacy SQL)', () => {
    const plan: SemanticPlan = {
      select: [{ expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' }],
      filters: [
        { kind: 'periodEq', part: 'year', value: 2026, date: col('created_at') },
        { kind: 'periodEq', part: 'month', value: 3, date: col('created_at') },
      ],
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.select).toEqual([{ expr: 'sum("orders"."amount")', alias: 'data' }]);
    expect(rendered.where).toEqual([
      'EXTRACT(YEAR FROM "orders"."created_at")::int = :nm_year',
      'EXTRACT(MONTH FROM "orders"."created_at")::int = :nm_month',
    ]);
    expect(rendered.params).toEqual({ nm_year: 2026, nm_month: 3 });
  });

  it('renders period label + groupBy/orderBy for trends', () => {
    const plan: SemanticPlan = {
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('id') }, alias: 'data' },
        { expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' },
      ],
      filters: [],
      groupByLabel: true,
      orderByLabel: 'ASC',
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.groupBy).toBe('label');
    expect(rendered.orderBy).toEqual({ expr: 'label', dir: 'ASC' });
  });

  it('applies timezone conversion to date expressions and binds nm_tz', () => {
    const plan: SemanticPlan = {
      select: [{ expr: { kind: 'period', part: 'day', date: col('created_at') }, alias: 'label' }],
      filters: [],
      tz: 'America/Sao_Paulo',
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.select[0].expr).toContain(':nm_tz');
    expect(rendered.params.nm_tz).toBe('America/Sao_Paulo');
    expect(rendered.tz).toBe('America/Sao_Paulo');
  });

  it('renders structured where filters with sequential nm_w params', () => {
    const plan: SemanticPlan = {
      select: [{ expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('id') }, alias: 'data' }],
      filters: [
        { kind: 'where', column: col('status'), condition: 'paid' },
        { kind: 'where', column: col('member_id'), condition: [1, 2, 3] },
        { kind: 'where', column: col('deleted_at'), condition: null },
        { kind: 'where', column: col('amount'), condition: { gte: 10 } },
        { kind: 'where', column: col('tenant_id'), condition: [] },
      ],
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.where).toEqual([
      '"orders"."status" = :nm_w0',
      '"orders"."member_id" IN (:nm_w1, :nm_w2, :nm_w3)',
      '"orders"."deleted_at" IS NULL',
      '"orders"."amount" >= :nm_w4',
      '1 = 0',
    ]);
    expect(rendered.params).toEqual({ nm_w0: 'paid', nm_w1: 1, nm_w2: 2, nm_w3: 3, nm_w4: 10 });
  });

  it('renders dateBetween, grouped aggregates and distinct column selects', () => {
    const plan: SemanticPlan = {
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' },
        { expr: { kind: 'bucket', part: 'day', date: col('created_at') }, alias: 'label' },
        { expr: { kind: 'groupedAggregate', fn: Aggregate.SUM, column: col('status'), value: 'paid', index: 0 }, alias: 'data0' },
      ],
      filters: [{ kind: 'dateBetween', start: '2026-01-01', end: '2026-03-31', date: col('created_at') }],
      groupByLabel: true,
      orderByLabel: 'ASC',
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.select[2]).toEqual({
      expr: 'sum(CASE WHEN "orders"."status" = :nm_g0 THEN 1 ELSE 0 END)',
      alias: 'data0',
    });
    expect(rendered.params).toMatchObject({ nm_g0: 'paid', nm_start: '2026-01-01', nm_end: '2026-03-31' });

    const distinctPlan: SemanticPlan = {
      select: [{ expr: { kind: 'column', column: col('status') }, alias: 'label' }],
      filters: [],
      distinct: true,
      orderByLabel: 'ASC',
    };
    expect(renderPlan(distinctPlan, dialect, esc).distinct).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm dev npx vitest run test/render-plan.spec.ts`
Expected: FAIL — `Cannot find module '@core/backend/render-plan'`.

- [ ] **Step 3: Write the types**

```ts
// packages/core/src/backend/semantic-plan.ts
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
```

- [ ] **Step 4: Write the renderer**

```ts
// packages/core/src/backend/render-plan.ts
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
    for (const [ref, condition] of whereEntries) {
      // no-op loop kept trivial: compile one entry at a time preserving order
      void ref;
      void condition;
    }
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
```

Note for the implementer: delete the placeholder `void`/no-op loop above — it exists only to keep the plan snippet honest about `compileWhereOrdered` being the single compile path. `compileWhere` in `where.ts` stays exported (still used by tests/back-compat) but `render-plan.ts` may become its only production caller; if after Task 2 nothing else calls `compileWhere`, refactor `compileWhereOrdered` to be the shared core and make `compileWhere` a thin wrapper over it (DRY), keeping `where.ts` exports stable.

- [ ] **Step 5: Run test to verify it passes**

Run: `docker compose run --rm dev npx vitest run test/render-plan.spec.ts`
Expected: PASS (all 5 tests).

- [ ] **Step 6: Typecheck and commit**

Run: `docker compose run --rm dev npm run typecheck`
Expected: clean.

```bash
git add packages/core/src/backend/semantic-plan.ts packages/core/src/backend/render-plan.ts test/render-plan.spec.ts
git commit -m "feat(core): add semantic query plan types and SQL renderer"
```

---

### Task 2: Builder emits semantic plans; SQL backends render them

**Files:**
- Modify: `packages/core/src/metrics.builder.ts`
- Modify: `packages/core/src/backend/query-backend.interface.ts`
- Modify: `packages/core/src/backend/executor.backend.ts`
- Modify: `packages/core/src/backend/typeorm.backend.ts`
- Test: entire existing suite (no new tests; the SQL snapshot suites are the harness)

**Interfaces:**
- Consumes: `SemanticPlan`, `renderPlan` (Task 1).
- Produces: `QueryBackend` becomes `{ escapeId(name: string): string; run(plan: SemanticPlan): Promise<Row[]> }` (the `dialect` property moves off the interface; SQL backends keep it as their own field). Builder state becomes bare `ColumnRef`s: `columnRef: ColumnRef`, `dateColumnName: ColumnRef`, `labelColumnRef: ColumnRef | null`, `extraWhere: { column: ColumnRef; condition: WhereCondition }[]`. Later tasks rely on these exact field names and on private helpers `buildSemanticFilters(): Filter[]` and `semanticLabelExpr(): SelectExpr`.

- [ ] **Step 1: Run the harness first (baseline green)**

Run: `docker compose run --rm dev npm test`
Expected: PASS (record the count).

- [ ] **Step 2: Refactor the backends**

`query-backend.interface.ts`: `run(plan: SemanticPlan)`; keep `escapeId`; drop `dialect` from the interface (builder no longer reads it).

`executor.backend.ts` — `run` renders first:

```ts
import { renderPlan } from './render-plan';
import { SemanticPlan } from './semantic-plan';
// ...
async run(plan: SemanticPlan): Promise<Row[]> {
  if (plan.tz && this.dataSource.dialect === 'sqlite') {
    throw new SqliteTimezoneUnsupportedException(plan.tz);
  }
  const rendered = renderPlan(plan, this.dialect, (name) => this.dialect.escapeId(name));
  const { sql, params } = this.assemble(rendered);
  const rows = await this.dataSource.execute(sql, params);
  return rows.map((row) => this.normalizeRow(row));
}
```

`typeorm.backend.ts` — same pattern: `const rendered = renderPlan(plan, this.dialect, (name) => this.qb.connection.driver.escape(name));` then apply `rendered` exactly as the current body applies `plan` (select/distinct/where/groupBy/orderBy/params). The existing `escapeId` method stays.

- [ ] **Step 3: Refactor the builder state to bare refs**

In `metrics.builder.ts`:
- Replace eager qualification with captured refs. `qualify(column)` is replaced by `ref(column): ColumnRef` → `{ assertSafeIdentifier(column); return { table: this.tableName, column }; }` (table validated where it's set, as today). Delete `escapeId()` and the `dialect` field.
- Fields: `column: string` → `columnRef: ColumnRef` (init `this.ref('id')`), `dateColumnRef: string` → `dateColumnName: ColumnRef` (init `this.ref('created_at')`), `labelColumnName: string | null` → `labelColumnRef: ColumnRef | null`, `extraFilters: CompiledWhere | null` → `extraWhere: { column: ColumnRef; condition: WhereCondition }[] = []`.
- `applyExecutorWhere(where)` → `for (const [column, condition] of Object.entries(where)) this.extraWhere.push({ column: this.ref(column), condition });`
- `baseClone()` copies `columnRef`, `dateColumnName`, `extraWhere` (spread: `clone.extraWhere = [...this.extraWhere]`).
- `buildFilters` → `buildSemanticFilters(): Filter[]`: same switch, but pushing `{ kind: 'periodEq', part, value, date: this.dateColumnName }` / `{ kind: 'periodBetween', ... }` / `{ kind: 'dateBetween', start, end, date: this.dateColumnName }`, then `...this.extraWhere.map((w) => ({ kind: 'where' as const, ...w }))`. `eqFilter`/`betweenFilter`/`applyTz`/`dateExpr`/`labelExpr` params/SQL logic all move out (renderer owns them); keep `tzActive()`.
- `metrics()`:

```ts
async metrics(): Promise<number> {
  const plan: SemanticPlan = {
    select: [{ expr: { kind: 'aggregate', fn: this.aggregateFn, column: this.columnRef }, alias: 'data' }],
    filters: this.buildSemanticFilters(),
    tz: this.tzActive() ? this.timezone : undefined,
  };
  const rows = await this.backend.run(plan);
  return normalizeData(rows[0]?.data);
}
```

- `trendsData()` select: aggregate + `{ expr: this.semanticLabelExpr(), alias: 'label' }` + grouped items `{ kind: 'groupedAggregate', fn: this.groupedAggregate, column: this.columnRef, value, index: i }` as `data{i}`; `groupByLabel: true`, `orderByLabel: 'ASC'`.
- `semanticLabelExpr(): SelectExpr`: labelColumn → `{ kind: 'column', column: this.labelColumnRef }`; range → `{ kind: 'bucket', part: this.groupBy, date: this.dateColumnName }`; period → `{ kind: 'period', part: PERIOD_TO_DATE_PART[this.period], date: this.dateColumnName }`; else `{ kind: 'date', date: this.dateColumnName }`.
- `canonicalLabels()` distinct plan: `select: [{ expr: { kind: 'column', column: this.labelColumnRef as ColumnRef }, alias: 'label' }], filters: [], distinct: true, orderByLabel: 'ASC'`.

- [ ] **Step 4: Run the full harness**

Run: `docker compose run --rm dev npm test && docker compose run --rm dev npm run typecheck`
Expected: PASS with the same test count as Step 1 — especially `executor-sql.spec.ts`, `dialects-sql.spec.ts`, `executor-where.spec.ts`, `timezone.spec.ts`. Any SQL snapshot diff is a renderer bug: fix `render-plan.ts`, never the snapshot.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src test/render-plan.spec.ts
git commit -m "refactor(core): builder emits semantic plans; SQL rendering moves into backends"
```

---

### Task 3: Fluent `.where()` / `.whereIn()` in both modes

**Files:**
- Modify: `packages/core/src/metrics.builder.ts`
- Modify: `packages/core/src/index.ts` (export `WhereCondition`, `WhereScalar`, `RangeCondition` if not already exported)
- Test: `test/fluent-where.spec.ts`

**Interfaces:**
- Consumes: `extraWhere`, `ref()` (Task 2), `WhereCondition`/`WhereScalar` from `where.ts`.
- Produces: `where(column: string, condition: WhereCondition): this` and `whereIn(column: string, values: WhereScalar[]): this` on `MetricsBuilder`. `queryExecutor`'s `spec.where` becomes sugar over `where()`.

- [ ] **Step 1: Write the failing test**

```ts
// test/fluent-where.spec.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import { createOrdersDataSource, ordersQuery, resetOrders, seedOrders } from './helpers/orders-datasource';

describe('fluent where / whereIn', () => {
  let typeorm: TypeOrmDataSource;
  let executor: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    executor = { dialect: 'sqlite', execute: (sql, params) => typeorm.query(sql, params) };
    await resetOrders(typeorm);
    await seedOrders(typeorm, [
      { createdAt: '2026-01-10', amount: 100, status: 'paid' },
      { createdAt: '2026-01-20', amount: 50, status: 'pending' },
      { createdAt: '2026-02-05', amount: 200, status: 'paid' },
      { createdAt: '2026-02-15', amount: 75, status: 'refunded' },
    ]);
  });

  afterAll(async () => {
    await typeorm.destroy();
  });

  const exec = () =>
    MetricsBuilder.queryExecutor(executor, { table: 'orders', dateColumn: 'created_at' });

  it('whereIn scopes an executor-mode metric (the visibility-gate pattern)', async () => {
    expect(await exec().whereIn('status', ['paid', 'refunded']).count().metrics()).toBe(3);
  });

  it('empty whereIn matches nothing (fail closed)', async () => {
    expect(await exec().whereIn('status', []).count().metrics()).toBe(0);
  });

  it('where supports equality, range and null, ANDed across calls', async () => {
    expect(await exec().where('status', 'paid').where('amount', { gte: 150 }).count().metrics()).toBe(1);
  });

  it('works in TypeORM mode too', async () => {
    const qb = ordersQuery(typeorm);
    expect(await MetricsBuilder.query(qb).whereIn('status', ['paid']).count().metrics()).toBe(2);
  });

  it('survives metricsWithVariations cloning (scope applies to both periods)', async () => {
    const result = await exec()
      .whereIn('status', ['paid'])
      .countByMonth('id', 1)
      .forMonth(2)
      .forYear(2026)
      .metricsWithVariations(1, 'month' as never);
    expect(result.count).toBe(1);
  });
});
```

Note: check how `Period` is imported in `test/variations.spec.ts` and use the same idiom instead of `'month' as never`.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm dev npx vitest run test/fluent-where.spec.ts`
Expected: FAIL — `whereIn is not a function`.

- [ ] **Step 3: Implement**

In `metrics.builder.ts`, next to the Targeting section:

```ts
/**
 * AND a structured condition onto every query: scalar = equality, array = IN
 * (empty array matches nothing — fail closed), object = range (gte/lte/gt/lt),
 * null = IS NULL. Values always bind as parameters; the column name is
 * validated (assertSafeIdentifier) and driver-escaped. Chain multiple calls
 * to AND conditions. This is the hook for scoping/visibility gates.
 */
where(column: string, condition: WhereCondition): this {
  this.extraWhere.push({ column: this.ref(column), condition });
  return this;
}

/** Sugar for `where(column, values)`: membership with bound parameters. */
whereIn(column: string, values: WhereScalar[]): this {
  return this.where(column, values);
}
```

`applyExecutorWhere` becomes: `for (const [column, condition] of Object.entries(where)) this.where(column, condition);` — keep the method (queryExecutor still calls it). Export `WhereCondition`, `WhereScalar`, `RangeCondition`, `WhereInput` from `packages/core/src/index.ts`.

- [ ] **Step 4: Run tests**

Run: `docker compose run --rm dev npx vitest run test/fluent-where.spec.ts && docker compose run --rm dev npm test`
Expected: PASS (new suite + full suite, including `executor-where.spec.ts` untouched).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src test/fluent-where.spec.ts
git commit -m "feat(core): chainable where()/whereIn() in TypeORM and executor modes"
```

---

### Task 4: RowsBackend — interpret the semantic plan in memory

**Files:**
- Create: `packages/core/src/backend/rows.backend.ts`
- Create: `packages/core/src/exceptions/invalid-row-date.exception.ts`
- Test: `test/rows-backend.spec.ts`

**Interfaces:**
- Consumes: `SemanticPlan`, `Filter`, `SelectExpr` (Task 1), `QueryBackend` (Task 2), Luxon `DateTime`, `normalizeData`/`normalizeLabel`.
- Produces: `class RowsBackend implements QueryBackend { constructor(rows: Record<string, unknown>[]); escapeId(name: string): string; run(plan: SemanticPlan): Promise<Row[]> }` and `class InvalidRowDateException extends Error { constructor(rowIndex: number, value: unknown) }`. Task 5 wires it into `fromRows`.

- [ ] **Step 1: Write the failing test**

```ts
// test/rows-backend.spec.ts
import { describe, expect, it } from 'vitest';
import { RowsBackend } from '@core/backend/rows.backend';
import { SemanticPlan } from '@core/backend/semantic-plan';
import { Aggregate } from '@core/enums/aggregate.enum';
import { InvalidRowDateException } from '@core/exceptions/invalid-row-date.exception';

const col = (column: string) => ({ table: 'rows', column });

const rows = [
  { created_at: '2026-01-10T12:00:00Z', amount: 100, status: 'paid', member_id: 1 },
  { created_at: '2026-01-20T12:00:00Z', amount: 50, status: 'pending', member_id: 2 },
  { created_at: '2026-02-05T12:00:00Z', amount: 200, status: 'paid', member_id: 1 },
  { created_at: new Date('2026-03-01T12:00:00Z'), amount: 300, status: 'paid', member_id: 3 },
];

const run = (plan: SemanticPlan, data = rows) => new RowsBackend(data).run(plan);

describe('RowsBackend', () => {
  it('aggregates a bare metric', async () => {
    const out = await run({
      select: [{ expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' }],
      filters: [],
    });
    expect(out).toEqual([{ data: 650 }]);
  });

  it('buckets a monthly trend with period filters and orders by label', async () => {
    const out = await run({
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' },
        { expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' },
      ],
      filters: [{ kind: 'periodEq', part: 'year', value: 2026, date: col('created_at') }],
      groupByLabel: true,
      orderByLabel: 'ASC',
    });
    expect(out).toEqual([
      { data: 150, label: 1 },
      { data: 200, label: 2 },
      { data: 300, label: 3 },
    ]);
  });

  it('applies structured where with SQL semantics (empty IN = nothing, null, range)', async () => {
    const count = (filters: SemanticPlan['filters']) =>
      run({
        select: [{ expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('member_id') }, alias: 'data' }],
        filters,
      });
    expect(await count([{ kind: 'where', column: col('member_id'), condition: [1, 3] }])).toEqual([{ data: 3 }]);
    expect(await count([{ kind: 'where', column: col('member_id'), condition: [] }])).toEqual([{ data: 0 }]);
    expect(await count([{ kind: 'where', column: col('amount'), condition: { gte: 100, lt: 300 } }])).toEqual([{ data: 2 }]);
    expect(await count([{ kind: 'where', column: col('status'), condition: null }])).toEqual([{ data: 0 }]);
  });

  it('extracts periods in the configured timezone (UTC−3 month boundary)', async () => {
    // 2026-03-01T01:00Z is still 2026-02-28 in America/Sao_Paulo (UTC−3).
    const boundary = [{ created_at: '2026-03-01T01:00:00Z', amount: 10 }];
    const plan = (tz?: string): SemanticPlan => ({
      select: [{ expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' },
               { expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' }],
      filters: [],
      groupByLabel: true,
      orderByLabel: 'ASC',
      tz,
    });
    expect(await run(plan(), boundary)).toEqual([{ label: 3, data: 10 }]);
    expect(await run(plan('America/Sao_Paulo'), boundary)).toEqual([{ label: 2, data: 10 }]);
  });

  it('computes date buckets, grouped aggregates and distinct labels', async () => {
    const bucketed = await run({
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('member_id') }, alias: 'data' },
        { expr: { kind: 'bucket', part: 'month', date: col('created_at') }, alias: 'label' },
        { expr: { kind: 'groupedAggregate', fn: Aggregate.SUM, column: col('status'), value: 'paid', index: 0 }, alias: 'data0' },
      ],
      filters: [{ kind: 'dateBetween', start: '2026-01-01', end: '2026-02-28', date: col('created_at') }],
      groupByLabel: true,
      orderByLabel: 'ASC',
    });
    expect(bucketed).toEqual([
      { data: 2, label: '2026-01', data0: 1 },
      { data: 1, label: '2026-02', data0: 1 },
    ]);

    const distinct = await run({
      select: [{ expr: { kind: 'column', column: col('status') }, alias: 'label' }],
      filters: [],
      distinct: true,
      orderByLabel: 'ASC',
    });
    expect(distinct).toEqual([{ label: 'paid' }, { label: 'pending' }]);
  });

  it('fails fast on an unparseable date, naming the row index', async () => {
    const bad = [{ created_at: 'not-a-date', amount: 1 }];
    await expect(
      run({
        select: [{ expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' }],
        filters: [],
        groupByLabel: true,
      }, bad),
    ).rejects.toThrow(InvalidRowDateException);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm dev npx vitest run test/rows-backend.spec.ts`
Expected: FAIL — `Cannot find module '@core/backend/rows.backend'`.

- [ ] **Step 3: Implement the exception and the backend**

```ts
// packages/core/src/exceptions/invalid-row-date.exception.ts
/** A fromRows() row carried a date value Luxon could not parse. */
export class InvalidRowDateException extends Error {
  constructor(rowIndex: number, value: unknown) {
    super(`nestjs-metrics: row ${rowIndex} has an unparseable date value: ${String(value)}`);
    this.name = 'InvalidRowDateException';
  }
}
```

```ts
// packages/core/src/backend/rows.backend.ts
import { DateTime } from 'luxon';
import { Row } from '../datasource';
import { Aggregate } from '../enums/aggregate.enum';
import { DatePart } from '../dialects/sql-dialect.interface';
import { InvalidRowDateException } from '../exceptions/invalid-row-date.exception';
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

  /** Identifiers are never rendered into SQL in rows mode. */
  escapeId(name: string): string {
    return name;
  }

  async run(plan: SemanticPlan): Promise<Row[]> {
    const zone = plan.tz ?? 'UTC';
    const kept = this.rows.filter((row, index) =>
      plan.filters.every((filter) => this.matches(filter, row, index, zone)),
    );

    const labelItem = plan.select.find((item) => item.alias === 'label');

    if (plan.distinct && labelItem) {
      const values = new Set<string | number>();
      kept.forEach((row, i) => values.add(this.evalLabel(labelItem.expr, row, i, zone)));
      const sorted = [...values].sort(compareLabels);
      return sorted.map((label) => ({ label }));
    }

    const groups = new Map<string | number, SourceRow[]>();
    if (labelItem && plan.groupByLabel) {
      kept.forEach((row, i) => {
        const label = this.evalLabel(labelItem.expr, row, i, zone);
        const bucket = groups.get(label);
        if (bucket) {
          bucket.push(row);
        } else {
          groups.set(label, [row]);
        }
      });
    } else {
      groups.set('', kept);
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

  private evalAggregate(expr: SelectExpr, rows: SourceRow[]): number {
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
function aggregate(fn: Aggregate, values: unknown[]): number {
  const present = values.filter((value) => value !== null && value !== undefined);
  if (fn === Aggregate.COUNT) {
    return present.length;
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
    case Aggregate.MAX:
      return Math.max(...nums);
    case Aggregate.MIN:
      return Math.min(...nums);
    default:
      return 0;
  }
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
    const n = Number(value);
    if (value === null || value === undefined || Number.isNaN(n)) {
      return false;
    }
    if (range.gte !== undefined && !(n >= Number(range.gte))) return false;
    if (range.lte !== undefined && !(n <= Number(range.lte))) return false;
    if (range.gt !== undefined && !(n > Number(range.gt))) return false;
    if (range.lt !== undefined && !(n < Number(range.lt))) return false;
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
```

- [ ] **Step 4: Run tests**

Run: `docker compose run --rm dev npx vitest run test/rows-backend.spec.ts && docker compose run --rm dev npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/backend/rows.backend.ts packages/core/src/exceptions/invalid-row-date.exception.ts test/rows-backend.spec.ts
git commit -m "feat(core): RowsBackend interprets semantic plans over in-memory rows"
```

---

### Task 5: `MetricsBuilder.fromRows()` entry point + full-parity suite

**Files:**
- Modify: `packages/core/src/metrics.builder.ts`
- Modify: `packages/core/src/datasource.ts` (add `RowsSpec`)
- Modify: `packages/core/src/exceptions/` — create `unsupported-in-rows-mode.exception.ts`
- Modify: `packages/core/src/index.ts` (export `RowsSpec`, `InvalidRowDateException`, `UnsupportedInRowsModeException`)
- Test: `test/from-rows.spec.ts`

**Interfaces:**
- Consumes: `RowsBackend` (Task 4), builder internals (Task 2), `where()` (Task 3).
- Produces: `static fromRows(rows: Record<string, unknown>[], spec?: RowsSpec, options?: MetricsOptions): MetricsBuilder<ObjectLiteral>` where `RowsSpec = { dateColumn?: string }` (default `'created_at'`). In rows mode `.table()` throws `UnsupportedInRowsModeException`.

- [ ] **Step 1: Write the failing test**

```ts
// test/from-rows.spec.ts
import { describe, expect, it } from 'vitest';
import { MetricsBuilder } from '@core/metrics.builder';
import { UnsupportedInRowsModeException } from '@core/exceptions/unsupported-in-rows-mode.exception';

const rows = [
  { created_at: '2026-01-10', amount: 100, status: 'paid', member_id: 1 },
  { created_at: '2026-01-20', amount: 50, status: 'pending', member_id: 2 },
  { created_at: '2026-02-05', amount: 200, status: 'paid', member_id: 1 },
  { created_at: '2026-03-01', amount: 300, status: 'paid', member_id: 3 },
  { created_at: '2026-05-11', amount: 150, status: 'paid', member_id: 1 },
];

const build = () => MetricsBuilder.fromRows(rows);

describe('MetricsBuilder.fromRows', () => {
  it('computes bare metrics', async () => {
    expect(await build().count().metrics()).toBe(5);
    expect(await build().sum('amount').metrics()).toBe(800);
    expect(await build().average('amount').metrics()).toBe(160);
  });

  it('computes monthly trends with gap fill (the flagship use case)', async () => {
    const result = await build()
      .sumByMonth('amount', 0)
      .forYear(2026)
      .fillMissingData()
      .trends();
    expect(result).toEqual({
      labels: ['January', 'February', 'March', 'April', 'May'],
      data: [150, 200, 300, 0, 150],
    });
  });

  it('scopes with the fluent where (gate pattern) end to end', async () => {
    const result = await build()
      .whereIn('member_id', [1])
      .sumByMonth('amount', 0)
      .forYear(2026)
      .trends();
    expect(result).toEqual({ labels: ['January', 'February', 'May'], data: [100, 200, 150] });
  });

  it('supports labelColumn, groupData and ranges', async () => {
    const byStatus = await build().count().forYear(2026).byYear(1).labelColumn('status').trends();
    expect(byStatus).toEqual({ labels: ['paid', 'pending'], data: [4, 1] });

    const grouped = await build()
      .countBetween(['2026-01-01', '2026-03-31'])
      .groupByMonth()
      .groupData(['paid', 'pending'])
      .trends();
    expect(grouped).toEqual({
      labels: ['2026-01', '2026-02', '2026-03'],
      data: { total: [2, 1, 1], paid: [1, 1, 1], pending: [1, 0, 0] },
    });
  });

  it('supports metricsWithVariations', async () => {
    const result = await build()
      .sumByMonth('amount', 1)
      .forYear(2026)
      .forMonth(2)
      .metricsWithVariations(1, 'month' as never);
    expect(result.count).toBe(200);
    expect(result.variation.type).toBe('increase');
  });

  it('respects a configured timezone at month boundaries (UTC−3)', async () => {
    const boundary = [{ created_at: '2026-03-01T01:00:00Z', amount: 10 }];
    const utc = await MetricsBuilder.fromRows(boundary)
      .sumByMonth('amount', 0).forYear(2026).trends();
    const sp = await MetricsBuilder.fromRows(boundary, {}, { timezone: 'America/Sao_Paulo' })
      .sumByMonth('amount', 0).forYear(2026).trends();
    expect(utc).toEqual({ labels: ['March'], data: [10] });
    expect(sp).toEqual({ labels: ['February'], data: [10] });
  });

  it('rejects SQL-only settings', () => {
    expect(() => build().table('other')).toThrow(UnsupportedInRowsModeException);
  });
});
```

Same `Period` import note as Task 3 for `'month' as never`. Adjust the `labelColumn` case to match how `test/group-data.spec.ts` / CLAUDE.md compose year-scoped categorical grouping (`byYear(1).forYear(...)`) — copy the established idiom, keep the expected values.

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm dev npx vitest run test/from-rows.spec.ts`
Expected: FAIL — `fromRows is not a function`.

- [ ] **Step 3: Implement**

```ts
// packages/core/src/exceptions/unsupported-in-rows-mode.exception.ts
/** A SQL-only builder setting was used on a fromRows() builder. */
export class UnsupportedInRowsModeException extends Error {
  constructor(method: string) {
    super(`nestjs-metrics: ${method}() is not supported in fromRows() mode`);
    this.name = 'UnsupportedInRowsModeException';
  }
}
```

In `datasource.ts`:

```ts
/** Spec for the in-memory rows entry point (MetricsBuilder.fromRows). */
export interface RowsSpec {
  /** The row property holding the bucketing date. Default: 'created_at'. */
  dateColumn?: string;
}
```

In `metrics.builder.ts`:

```ts
private rowsMode = false;

/**
 * Entry point over pre-fetched rows: the caller owns 100% of the SQL (e.g. a
 * scoped/visibility-gated query); the builder does the bucketing, gap fill,
 * timezone handling and labels. Full API parity with the SQL modes.
 */
static fromRows(
  rows: Record<string, unknown>[],
  spec: RowsSpec = {},
  options?: MetricsOptions,
): MetricsBuilder<ObjectLiteral> {
  const builder = new MetricsBuilder<ObjectLiteral>(new RowsBackend(rows), 'rows', options);
  builder.rowsMode = true;
  if (spec.dateColumn) {
    builder.dateColumn(spec.dateColumn);
  }
  return builder;
}
```

Guard in `table()` (first line): `if (this.rowsMode) throw new UnsupportedInRowsModeException('table');`
`baseClone()` copies `rowsMode` (variations cloning). Export the new symbols from `index.ts`.

Timezone note: the SQLite-only tz restriction lives in `ExecutorBackend`; `RowsBackend` handles any IANA zone via Luxon — no extra guard needed (`assertTimezone` already validates the name).

- [ ] **Step 4: Run tests**

Run: `docker compose run --rm dev npx vitest run test/from-rows.spec.ts && docker compose run --rm dev npm test`
Expected: PASS (new suite + full suite).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src test/from-rows.spec.ts
git commit -m "feat(core): fromRows() entry point — full builder parity over in-memory rows"
```

---

### Task 6: Equivalence suite — SQL backend vs RowsBackend

**Files:**
- Test: `test/rows-equivalence.spec.ts`

**Interfaces:**
- Consumes: `MetricsBuilder.queryExecutor` (SQLite via better-sqlite3, as in `executor-where.spec.ts`), `MetricsBuilder.fromRows`, test helpers from `test/helpers/orders-datasource.ts`.
- Produces: nothing new — a regression net proving both engines answer identically.

- [ ] **Step 1: Write the failing-if-divergent test**

```ts
// test/rows-equivalence.spec.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import { createOrdersDataSource, resetOrders, seedOrders } from './helpers/orders-datasource';

const SEED = [
  { createdAt: '2026-01-10', amount: 100, status: 'paid' },
  { createdAt: '2026-01-31', amount: 50, status: 'pending' },
  { createdAt: '2026-02-01', amount: 200, status: 'paid' },
  { createdAt: '2026-02-15', amount: 75, status: 'refunded' },
  { createdAt: '2026-03-01', amount: 300, status: 'paid' },
  { createdAt: '2026-05-11', amount: 150, status: 'paid' },
];
// Same data as plain rows for fromRows (snake_case column, like the table).
const ROWS = SEED.map(({ createdAt, ...rest }) => ({ created_at: createdAt, ...rest }));

describe('SQL backend and RowsBackend answer identically', () => {
  let typeorm: TypeOrmDataSource;
  let executor: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    executor = { dialect: 'sqlite', execute: (sql, params) => typeorm.query(sql, params) };
    await resetOrders(typeorm);
    await seedOrders(typeorm, SEED);
  });

  afterAll(async () => {
    await typeorm.destroy();
  });

  const sql = () => MetricsBuilder.queryExecutor(executor, { table: 'orders', dateColumn: 'created_at' });
  const mem = () => MetricsBuilder.fromRows(ROWS);

  type Chain = (b: ReturnType<typeof sql>) => ReturnType<typeof sql>;
  const same = async (chain: Chain, terminal: 'metrics' | 'trends' = 'trends') => {
    const [a, b] = await Promise.all([
      (chain(sql()) as any)[terminal](),
      (chain(mem() as any) as any)[terminal](),
    ]);
    expect(b).toEqual(a);
  };

  it('bare metrics', () => same((b) => b.sum('amount'), 'metrics'));
  it('monthly trends with gap fill', () =>
    same((b) => b.sumByMonth('amount', 0).forYear(2026).fillMissingData()));
  it('scoped trends via whereIn', () =>
    same((b) => b.whereIn('status', ['paid']).countByMonth('id', 0).forYear(2026)));
  it('range bucketing by week', () =>
    same((b) => b.countBetween(['2026-01-01', '2026-03-31']).groupByWeek().fillMissingData()));
  it('categorical labelColumn', () =>
    same((b) => b.count().byYear(1).forYear(2026).labelColumn('status')));
  it('grouped multi-series', () =>
    same((b) =>
      b.sumByMonth('amount', 0).forYear(2026).groupData(['paid', 'pending']).fillMissingData(),
    ));
});
```

The UTC−3 month-boundary case cannot run against SQLite (`SqliteTimezoneUnsupportedException`); it is asserted with expected literals in `test/from-rows.spec.ts` (Task 5), mirroring `test/timezone.spec.ts` semantics.

- [ ] **Step 2: Run**

Run: `docker compose run --rm dev npx vitest run test/rows-equivalence.spec.ts`
Expected: PASS. Any failure is a RowsBackend semantics bug (label type, gap-fill interplay, ISO week) — fix `rows.backend.ts`, using the SQL result as ground truth.

- [ ] **Step 3: Full suite + smoke**

Run: `docker compose run --rm dev npm test && docker compose run --rm dev npm run build && docker compose run --rm dev npm run typecheck`
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add test/rows-equivalence.spec.ts
git commit -m "test(core): equivalence suite pinning RowsBackend to SQL backend semantics"
```

---

### Task 7: Documentation + changesets

**Files:**
- Modify: `packages/core/README.md`
- Modify: `README.md` (root) and `packages/nestjs-metrics/README.md`, `packages/nextjs-metrics/README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `CLAUDE.md` (API quick reference)
- Create: `.changeset/fluent-where-rows-backend.md`

**Interfaces:**
- Consumes: final public API from Tasks 3 & 5 (`where`, `whereIn`, `fromRows`, `RowsSpec`, exceptions).
- Produces: published docs; a minor-bump changeset for the three packages.

- [ ] **Step 1: Core README — "Scoping with structured where" section**

Add after the executor-mode section (adapt heading levels to the file). Content to include verbatim (code) plus surrounding prose in the README's existing voice:

````markdown
### Scoping with `where` / `whereIn`

Every query the builder runs can be AND-scoped with structured, parameter-bound
filters — the hook for multi-tenant / visibility gates:

```ts
// A gate wraps the builder and injects the caller's visible ids:
const scoped = Metrics.queryExecutor(db, { table: 'donations', dateColumn: 'created_at' })
  .whereIn('member_id', visibleIds)   // array → IN (…), every value bound
  .where('status', 'confirmed')       // scalar → equality
  .where('amount', { gte: 0 });       // object → range (gte/lte/gt/lt); null → IS NULL

await scoped.sumByMonth('amount', 12).fillMissingData().trends();
```

Guarantees: values only ever travel as bound parameters; column names are
validated and driver-escaped; an **empty `whereIn` list matches nothing**
(fail closed). Also available in TypeORM mode and as
`queryExecutor(ds, { …, where: { member_id: visibleIds } })`.
````

- [ ] **Step 2: Core README — "Bring your own SQL: fromRows" section**

````markdown
### Bring your own SQL: `fromRows`

When your query layer must own 100% of the SQL (Kysely, raw pg, an
architecture rule that every read goes through a scoped query), hand the
builder the rows and let it do the hard part — period bucketing, gap fill,
timezone-correct month boundaries, labels, variations:

```ts
const rows = await scopedQuery.selectFrom('donations').selectAll().execute();

await Metrics.fromRows(rows, { dateColumn: 'created_at' }, { timezone: 'America/Sao_Paulo' })
  .sumByMonth('amount', 12)
  .fillMissingData()
  .trends(); // identical output to the SQL modes, verified by an equivalence suite
```

`dateColumn` accepts `Date`, ISO strings or epoch milliseconds. The full
fluent API works (`count/sum/average/max/min`, periods, `between`,
`labelColumn`, `groupData`, `metricsWithVariations`, `where`/`whereIn`).
An unparseable date throws `InvalidRowDateException` naming the row index;
`.table()` throws `UnsupportedInRowsModeException`.
````

- [ ] **Step 3: Wrapper READMEs, root README, ARCHITECTURE, CLAUDE.md**

- Root `README.md` + `packages/nestjs-metrics/README.md` + `packages/nextjs-metrics/README.md`: add both features to the feature list and a short pointer ("Scoping (`where`/`whereIn`) and rows-in mode (`fromRows`) — see the core README") near the executor-mode docs; the wrappers re-export the builder so both features work through them unchanged — say so explicitly.
- `docs/ARCHITECTURE.md`: update the builder-internals description: builder emits a **SemanticPlan** (`backend/semantic-plan.ts`); `renderPlan()` (`backend/render-plan.ts`) renders SQL for the TypeORM/executor backends; `RowsBackend` interprets the plan in memory. One paragraph per backend, plus the invariant: *SQL output is snapshot-locked; RowsBackend is equivalence-locked to the SQL backends.*
- `CLAUDE.md` API quick reference: add two lines —
  `- where(col, cond)` / `whereIn(col, values)` — structured AND filters, bound params, empty IN ⇒ nothing.
  `- fromRows(rows, {dateColumn})` — in-memory backend, full parity, tz-aware bucketing.

- [ ] **Step 4: Changeset**

```markdown
---
'nestjs-metrics-core': minor
'nestjs-metrics': minor
'nextjs-metrics': minor
---

Add chainable `where()`/`whereIn()` structured filters (both modes, bound
parameters, empty IN fails closed) and a `fromRows()` entry point that runs
the full builder API over in-memory rows — bring-your-own-SQL with
timezone-correct bucketing. Internals: the builder now emits a semantic query
plan; SQL rendering moved into the backends (generated SQL unchanged).
```

Save as `.changeset/fluent-where-rows-backend.md`.

- [ ] **Step 5: Verify and commit**

Run: `docker compose run --rm dev npm test && docker compose run --rm dev npm run build`
Expected: PASS (docs don't break builds; changeset lints on release).

```bash
git add packages/*/README.md README.md docs/ARCHITECTURE.md CLAUDE.md .changeset/fluent-where-rows-backend.md
git commit -m "docs: document where/whereIn scoping and fromRows; add release changeset"
```

---

## Self-review notes

- **Spec coverage:** §2 → Task 3 (+docs Task 7); §3 → Tasks 4–5; §4 → Tasks 1–2 (snapshot-locked); §5 errors → Tasks 4–5 (`InvalidRowDateException` with row index, `UnsupportedInRowsModeException`, absent-column `where` semantics via `matchCondition` returning false / `IS NULL` not matching `undefined` — covered by `looseEquals` guards); §6 → Tasks 5–6 (tz boundary case in Task 5 because SQLite can't run tz); §7 releasing → Task 7.
- **Known judgment call:** `compileWhereOrdered` duplicates `compileWhere`'s grammar; Task 1 note requires DRY-ing them once Task 2 lands if `compileWhere` loses its production callers.
- **Type consistency:** `ColumnRef`/`SemanticPlan`/`renderPlan`/`RowsBackend`/`fromRows`/`RowsSpec` names are used identically across tasks; `groupedAggregate` carries `index` so `renderPlan` can emit legacy `nm_g{i}` names.
