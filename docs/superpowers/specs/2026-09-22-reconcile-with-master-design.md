# Reconcile `feat/fluent-where-rows-backend` with master's parallel evolution — Design

Date: 2026-09-22
Status: approved

## 1. Context and goal

`feat/fluent-where-rows-backend` (design: `2026-09-22-fluent-where-and-rows-backend-design.md`)
added chainable `.where()`/`.whereIn()` and a `MetricsBuilder.fromRows()` entry point with full
API parity, via a `SemanticPlan`/`renderPlan()`/`RowsBackend` refactor. While that branch was
isolated in its own worktree, `master` gained a large, independent body of work (PRs #78–#89,
~1,830 lines across 42 files in `packages/core/src`): a caching layer, chart-export adapters
(ApexCharts/Chart.js/Recharts), an MSSQL dialect, Zod-based option validation, a typed
`MetricsError` exception hierarchy, `hour` period granularity, `COUNT_DISTINCT`, cumulative
trends, and period-comparison trends (`trendsWithComparison`).

Attempting to merge directly produces both textual conflicts and type-level breaks (missing
`QueryPlan.source`, non-exhaustive `DatePart`/`Aggregate` switches) in the ~8 files both branches
modified. This spec defines how to reconcile: keep all of master's independent work untouched via
a real `git merge`, and extend (not replace) the `SemanticPlan` architecture to cover master's new
surface, so `where()`/`whereIn()`/`fromRows()` land with genuine parity against the *current*
`master`, not the stale snapshot the branch was built against.

## 2. Git integration

`git merge origin/master` into `feat/fluent-where-rows-backend` — one merge commit, not a 17-commit
rebase. The ~35 files master touched that this branch never touched (`cache/`, `charts/`,
`dialects/mssql.dialect.ts`, `options.schema.ts`, `repository.ts` doc-only changes, most exception
files, enum additions) merge automatically with zero hand-editing. Manual reconciliation is scoped
to exactly the files both branches modified: `metrics.builder.ts`, `backend/executor.backend.ts`,
`backend/typeorm.backend.ts`, `backend/query-backend.interface.ts`, `backend/query-plan.ts`,
`datasource.ts`, `index.ts`. This branch's three new files (`backend/semantic-plan.ts`,
`backend/render-plan.ts`, `backend/rows.backend.ts`) have no conflicting counterpart on master —
they get extended, not merged.

## 3. SemanticPlan extensions

- `SemanticPlan` gains `source: string` — an opaque identity string (TypeORM's `qb.getQuery()`, or
  the executor's `from` fragment), passed straight through `renderPlan()` into the SQL
  `QueryPlan.source` unchanged. It is cache-key material, not a SQL expression, and `RowsBackend`
  never needs to interpret it (see §6).
- `SelectExpr`/`Filter` typing (already keyed on `Aggregate`/`DatePart`) extend for free once
  `Aggregate.COUNT_DISTINCT` and `DatePart: 'hour'` exist on the merged enums. TypeScript's
  exhaustiveness checking forces every `switch` in `render-plan.ts` and `rows.backend.ts` to add the
  new cases — that compiler pressure is the correctness net for this extension, not manual review.
- `QueryBackend` regains `toSql(plan, mask?): string` (present on master, removed by this branch's
  final-review fix wave before this merge was known to be necessary — that removal is undone as
  part of this reconciliation). The two SQL backends implement it for real, mirroring master's
  redaction logic (numbers → `0`, everything else → `'[REDACTED]'` when `mask` is true).
  `RowsBackend.toSql()` throws `UnsupportedInRowsModeException` — there is no SQL to preview, and a
  synthesized fake string would be actively misleading.
- `RowsBackend`'s own exceptions (`InvalidRowDateException`, `UnsupportedInRowsModeException`)
  migrate to extend `MetricsError` with a stable `code` (`'INVALID_ROW_DATE'`,
  `'UNSUPPORTED_IN_ROWS_MODE'`), matching the project-wide pattern master established for every
  other exception in this codebase.

## 4. Builder surface parity for `fromRows()`

Master added real feature surface since this branch's original "full parity" milestone. Each needs
to work identically through `fromRows()`:

- **`cumulative()` and `trendsWithComparison()`** are post-processing/composition on top of
  `trends()` (they operate on already-fetched result arrays, or clone+shift+re-run `trends()`
  twice). These should compose for free once `RowsBackend` produces correct output and whatever
  clone method(s) master uses (`baseClone()` and/or a new `cloneWithTrendState()`) propagate
  `rowsMode` the same way `baseClone()` already does. Verified by test, not special-cased.
- **`countDistinct()`** needs a real distinct-count aggregate in `RowsBackend`'s aggregate function
  (count of distinct non-null/non-undefined present values in the group).
- **`byHour()`/`groupByHour()`/`forHour()`** need `'hour'` as a valid `periodValue`/`bucketValue`
  case in `RowsBackend` (trivial with Luxon's `DateTime#hour`), and the period-reference/window
  logic (`PeriodReference.hour`, `hourPeriod()`) already exists on master's `PeriodResolver` and is
  inherited by the merge — `metrics.builder.ts`'s reconciled state must thread `this.hour` through
  identically to how it threads `this.day`/`this.week`/etc. today.
- **`groupData()`'s auto-discovery mode** (calling it with no `labels` argument) needs a rows-mode
  equivalent of master's new `resolveGroupLabels()` — same shape as this branch's existing
  `canonicalLabels()` handling: scoped by `where`/`whereIn`, not by period filters.

## 5. Bonus finding: `resolveGroupLabels()` likely has the same scoping leak this branch already fixed

Master's `resolveGroupLabels()` (the `groupData()` auto-discovery path) is, per direct inspection,
a parallel copy of the same "run an unscoped `SELECT DISTINCT column`" idiom as `canonicalLabels()`
— the exact method this branch's final review found leaking out-of-scope label values before
`.where()`/`.whereIn()` existed to leak *from*. Since fluent scoping didn't exist on master before
this merge, `resolveGroupLabels()` was never scoped, and won't become scoped unless fixed
explicitly. This is in scope for this reconciliation: apply the same fix (pass `extraWhere`-derived
filters into its plan; no period filters) to keep the scoping guarantee consistent across both
auto-discovery paths, in both SQL modes and in the new `RowsBackend` equivalent from §4.

## 6. Caching + `fromRows()`: explicitly unsupported

Master's cache keys on `source` (a stable query identity) plus the rendered `QueryPlan`. Rows
passed to `fromRows()` have no stable identity, and caching over arbitrary in-memory data by
content-hash is a different, unrequested feature. `fromRows()` validates that
`options.cache?.enabled` is not set and throws `ConfigurationError` if it is — fail loud, not
silently ignore, consistent with `.table()`'s existing "throw, don't silently misbehave"
convention in rows mode. `invalidateMetrics()`/`invalidateTrends()` become harmless no-ops in rows
mode (a defensive caller invalidating a cache that was never populated should not error).

## 7. Zod validation

Add a minimal `RowsSpecSchema` to `options.schema.ts` and validate `fromRows()`'s `spec`/`options`
arguments the same way `queryExecutor()` validates `ExecutorSpec`/`MetricsOptions`, respecting
`MetricsBuilder.skipValidation` — this makes `fromRows()` consistent with every other entry point
rather than the one that silently skips validation.

## 8. Testing

- Extend `test/rows-equivalence.spec.ts` with cases for `countDistinct`, `cumulative`, `byHour`,
  and `groupData()` auto-discovery — including a case proving an out-of-scope label does not leak
  through either `canonicalLabels()` or `resolveGroupLabels()` in rows mode, mirroring the SQL-mode
  fix from §5.
- Existing SQL snapshot suites remain the regression gate for the two SQL backends' rendered
  output; they must stay green and unmodified through the merge and the `hour`/`COUNT_DISTINCT`/
  `toSql` extension work.
- A fresh full-suite run after the merge (before any reconciliation edits) establishes the true
  combined baseline test count, since neither branch's standalone count is meaningful post-merge.

## 9. Out of scope

MSSQL dialect support for `RowsBackend` (not applicable — `RowsBackend` has no SQL dialect at all).
Chart-export adapters, cache backend implementations (`MemoryCacheStore`, `createCacheManagerStore`)
— untouched, inherited as-is from master. Adding caching support *to* `fromRows()` (§6 makes it an
explicit, validated non-feature, not a gap to fill later without a new design decision).

## 10. Release

After reconciliation is implemented and reviewed, this branch's existing changeset
(`.changeset/fluent-where-rows-backend.md`) needs a content update — its "internals" summary
currently doesn't mention the `hour`/`COUNT_DISTINCT`/scoping-leak-fix additions from this
reconciliation — but stays a **minor** bump for the same three packages. Standard two-phase
Changesets flow after that: PR merge to `master` opens "Version Packages"; merging that PR
publishes to npm.
