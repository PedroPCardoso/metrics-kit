# Fluent `where` + rows-in mode (RowsBackend) — Design

Date: 2026-09-22
Status: approved

## 1. Context and goal

A consumer project (Kysely + a visibility gate that injects `WHERE id IN (scope)`
on every analytics read) evaluated the library and identified two gaps:

1. **Scoping looked impossible.** In fact, structured `where` (equality, `IN`
   with bound params, ranges, `IS NULL`) already exists in executor mode via
   `MetricsBuilder.queryExecutor(ds, { table, dateColumn, where })`
   (`packages/core/src/where.ts`, applied at `metrics.builder.ts` /
   `applyExecutorWhere`, tested in `test/executor-where.spec.ts`, shipped since
   core 0.1.0). The real gap is **discoverability**: no fluent API, no README
   documentation.
2. **No rows-in mode.** There is no way to hand the library pre-fetched rows
   ("here are the records — bucket them into a monthly series with gap-fill,
   timezone-correct month boundaries, and period comparison") so a consumer's
   own query layer can own 100% of the SQL.

Deliverables: **(A)** fluent, documented `where` in both modes; **(B)** a
`fromRows` entry point with **full API parity**, implemented as an in-memory
`QueryBackend` over a semantic query plan.

## 2. Part A — fluent, documented `where`

- Add chainable `.where(column, condition)` and `.whereIn(column, values)` to
  `MetricsBuilder`, accepting the existing `WhereCondition` shapes (scalar,
  array → `IN`, `RangeCondition`, `null` → `IS NULL`). Multiple calls AND
  together (merged into the existing `extraFilters`).
- Works in **both** modes. In TypeORM mode the compiled fragments flow through
  the same `buildFilters` path (`typeorm.backend` already applies `plan.where`).
  Column names keep going through `qualify` — the existing identifier
  validation/escaping choke point. Values only ever bind as parameters.
- `queryExecutor(..., { where })` remains supported (sugar over the fluent
  methods).
- Docs: add a "Scoping / structured where" section to the core and wrapper
  READMEs, using the visibility-gate / multi-tenant pattern as the motivating
  example. Call out explicitly: all values are bound parameters; an empty `IN`
  array compiles to `1 = 0` (fail closed).

## 3. Part B — rows-in mode (`fromRows`)

```ts
MetricsBuilder.fromRows(rows, {
  dateColumn: 'created_at',        // Date | ISO string | epoch ms
  timezone: 'America/Sao_Paulo',   // optional
})
  .sumByMonth('amount', 12)
  .fillMissingData()
  .trends();
```

Full parity with the SQL modes: `count`/`sum`/`average`/`max`/`min`, all period
shorthands and windows, `forYear`/`forMonth`/…, `between`/`from`,
`labelColumn`, `groupData`, `metricsWithVariations`, plus `.where`/`.whereIn`
(in-memory filtering with identical semantics). Formatting, labels, gap-fill
and timezone handling stay a **single shared code path**, so month-boundary
behavior in UTC−3 is identical across all three backends by construction.

## 4. Architecture — semantic query plan

Blocking issue: today's `QueryPlan` carries rendered SQL strings
(`dialect.aggregate(...)` output, `where` fragments). An in-memory backend
cannot interpret SQL text. Therefore:

- **`QueryPlan` becomes semantic/structured**:
  - `select: [{ kind: 'aggregate', fn, column } | { kind: 'period', part } | { kind: 'column', name }]`
  - `filters: [{ kind: 'periodEq' | 'periodBetween' | 'where', ... }]`
  - `groupBy`, `params`, `tz`.
- **SQL rendering moves into the backends.** `ExecutorBackend` and
  `TypeOrmBackend` gain a render step (the `dialect.*` calls move out of the
  builder into the backends). The generated SQL must be byte-identical to
  today's: the existing SQL snapshot suites (`executor-sql.spec`,
  `dialects-sql.spec`) are the migration harness and must not change.
- **`RowsBackend` implements `QueryBackend.run(plan)`** by interpreting the
  plan over the row array with Luxon: timezone-aware period extraction,
  aggregation, group-by, and `where` filters matching `compileWhere` semantics
  (including empty `IN` → matches nothing).

This is a medium internal refactor, but it is the only path to parity without
duplicating aggregation/bucketing logic — and it pays down debt: the builder
stops knowing SQL.

## 5. Errors and edge cases

- Mixing `fromRows` with SQL-only settings (`.table()`, executor/TypeORM
  wiring) → typed exceptions, consistent with existing `Invalid...Exception`s.
- Invalid/unparseable date in a row → fail fast with a typed exception that
  includes the row index. Never silently skip.
- `where` on a column absent from the rows → treated as `undefined`: equality
  and `IN` don't match; `IS NULL` does **not** match `undefined` (documented).
- Timezone: same rule as SQL backends — convert to the configured timezone
  before extracting year/month/week/day parts.

## 6. Testing

- `rows-backend.spec.ts` mirroring the SQL suites' scenarios (same seeds, same
  expected outputs).
- Equivalence suite: same dataset through SQLite executor mode and through
  `fromRows` → identical results, explicitly including the UTC−3
  month-boundary case.
- Fluent `where`/`whereIn` covered in TypeORM mode, executor mode, and rows
  mode.
- Existing SQL snapshot suites gate the plan refactor (no SQL changes).

## 7. Release

- Changeset **minor** for `nestjs-metrics-core` and the wrappers.
- README updates in all three packages.

## 8. Out of scope

Streaming/chunked row input, a separate series-only package, publishing-flow
changes.
