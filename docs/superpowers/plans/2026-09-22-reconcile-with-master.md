# Reconcile with master — remaining work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish reconciling `feat/fluent-where-rows-backend` with `master`'s independent feature wave — the merge itself is done (commit `f9b8229`, 315/315 SQLite / 449/449 full-dialect-matrix passing) — by closing the three items its reconciliation report explicitly deferred, extending equivalence coverage for master's new features, and refreshing the release changeset.

**Architecture:** No new architecture. This plan operates entirely within the merged `ColumnRef`/`SemanticPlan`/`renderPlan()`/`RowsBackend` design already in place after the merge. Each task is additive: migrate two existing exception classes to the project's `MetricsError` hierarchy, add one Zod schema, extend one test file, edit one changeset file.

**Tech Stack:** TypeScript, Zod, Luxon, Vitest, tsup. Monorepo: `packages/core` for all code tasks, root for the changeset.

## Global Constraints

- All commands run **inside Docker**: prefix everything with `docker compose run --rm dev` (per CLAUDE.md).
- Existing SQL snapshot suites and the full 449-test dialect-matrix baseline (`docker compose up -d --wait postgres mysql` + `docker compose run --rm -e PG_HOST=postgres -e MYSQL_HOST=mysql dev npm test`) must stay green throughout — this is the regression gate the merge already established.
- Every typed exception in this codebase extends `MetricsError` (`packages/core/src/exceptions/metrics.error.ts`) with a stable `code` string — this plan brings the two rows-mode exceptions in line with that pattern, already used by every other exception file.
- Zod validation is opt-out via `MetricsBuilder.skipValidation` (static flag) — new validation must respect it, matching `validateExecutorSpec`'s call site at `packages/core/src/metrics.builder.ts:230-232`.
- Spec: `docs/superpowers/specs/2026-09-22-reconcile-with-master-design.md`. Merge report: `.superpowers/sdd/merge-reconciliation-report.md`.
- Releases via Changesets; this whole branch remains a **minor** bump for `nestjs-metrics-core`, `nestjs-metrics`, `nextjs-metrics`.

---

### Task 1: Migrate rows-mode exceptions to `MetricsError`

**Files:**
- Modify: `packages/core/src/exceptions/invalid-row-date.exception.ts`
- Modify: `packages/core/src/exceptions/unsupported-in-rows-mode.exception.ts`
- Test: `test/rows-backend.spec.ts`, `test/from-rows.spec.ts` (extend existing exception assertions)

**Interfaces:**
- Consumes: `MetricsError` and `MetricsErrorContext` from `packages/core/src/exceptions/metrics.error.ts` (constructor: `(message: string, code: string, context?: MetricsErrorContext, options?: { cause?: unknown })`).
- Produces: `InvalidRowDateException` and `UnsupportedInRowsModeException` remain the same exported names/constructors (`(rowIndex: number, value: unknown)` and `(method: string)` respectively) — callers in `packages/core/src/backend/rows.backend.ts` and `packages/core/src/metrics.builder.ts` need no changes, since neither the class names nor constructor signatures change.

- [ ] **Step 1: Write the failing tests**

Add to `test/rows-backend.spec.ts`, inside the existing `describe('RowsBackend', ...)` block, near the existing "fails fast on an unparseable date" test:

```ts
it('InvalidRowDateException carries a stable MetricsError code and context', async () => {
  const bad = [{ created_at: 'not-a-date', amount: 1 }];
  try {
    await run(
      {
        select: [{ expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' }],
        filters: [],
        groupByLabel: true,
      },
      bad,
    );
    expect.unreachable('expected InvalidRowDateException');
  } catch (err) {
    expect(err).toBeInstanceOf(MetricsError);
    expect(err).toBeInstanceOf(InvalidRowDateException);
    expect((err as InvalidRowDateException).code).toBe('INVALID_ROW_DATE');
    expect((err as InvalidRowDateException).context?.operation).toBe('fromRows');
  }
});
```

Add the import at the top of `test/rows-backend.spec.ts`:

```ts
import { MetricsError } from '@core/exceptions/metrics.error';
```

Add to `test/from-rows.spec.ts`, replacing the existing "rejects SQL-only settings" test body with an extended version that also checks the code:

```ts
it('rejects SQL-only settings with a stable MetricsError code', () => {
  try {
    build().table('other');
    expect.unreachable('expected UnsupportedInRowsModeException');
  } catch (err) {
    expect(err).toBeInstanceOf(MetricsError);
    expect(err).toBeInstanceOf(UnsupportedInRowsModeException);
    expect((err as UnsupportedInRowsModeException).code).toBe('UNSUPPORTED_IN_ROWS_MODE');
  }
});
```

Add the import at the top of `test/from-rows.spec.ts`:

```ts
import { MetricsError } from '@core/exceptions/metrics.error';
```

(`InvalidRowDateException`/`UnsupportedInRowsModeException` are already imported in both files from the original Task 4/5 work — reuse those imports, don't duplicate.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `docker compose run --rm dev npx vitest run test/rows-backend.spec.ts test/from-rows.spec.ts`
Expected: FAIL — `expect(err).toBeInstanceOf(MetricsError)` fails because both exceptions currently extend bare `Error`.

- [ ] **Step 3: Migrate the two exception classes**

```ts
// packages/core/src/exceptions/invalid-row-date.exception.ts
import { MetricsError } from './metrics.error';

/** A fromRows() row carried a date value Luxon could not parse. */
export class InvalidRowDateException extends MetricsError {
  constructor(rowIndex: number, value: unknown) {
    super(
      `nestjs-metrics: row ${rowIndex} has an unparseable date value: ${String(value)}`,
      'INVALID_ROW_DATE',
      { operation: 'fromRows', suggestion: 'Ensure every row\'s date column is a Date, ISO string, or epoch millisecond number.' },
    );
    this.name = 'InvalidRowDateException';
  }
}
```

```ts
// packages/core/src/exceptions/unsupported-in-rows-mode.exception.ts
import { MetricsError } from './metrics.error';

/** A SQL-only builder setting was used on a fromRows() builder. */
export class UnsupportedInRowsModeException extends MetricsError {
  constructor(method: string) {
    super(
      `nestjs-metrics: ${method}() is not supported in fromRows() mode`,
      'UNSUPPORTED_IN_ROWS_MODE',
      { operation: 'fromRows', suggestion: `Remove the ${method}() call, or use query()/queryExecutor() instead of fromRows().` },
    );
    this.name = 'UnsupportedInRowsModeException';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `docker compose run --rm dev npx vitest run test/rows-backend.spec.ts test/from-rows.spec.ts`
Expected: PASS, all tests in both files.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `docker compose run --rm dev npm test && docker compose run --rm dev npm run typecheck`
Expected: PASS (315/315 or higher), clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/exceptions/invalid-row-date.exception.ts packages/core/src/exceptions/unsupported-in-rows-mode.exception.ts test/rows-backend.spec.ts test/from-rows.spec.ts
git commit -m "fix(core): migrate rows-mode exceptions to the MetricsError hierarchy"
```

---

### Task 2: Zod validation for `fromRows()`

**Files:**
- Modify: `packages/core/src/options.schema.ts`
- Modify: `packages/core/src/datasource.ts` (re-point `RowsSpec` to the Zod-inferred type, mirroring how `ExecutorSpec` already works)
- Modify: `packages/core/src/metrics.builder.ts` (call `validateRowsSpec`/`validateMetricsOptions` in `fromRows()`)
- Test: `test/from-rows.spec.ts`

**Interfaces:**
- Consumes: `MetricsOptionsSchema`, `ValidationError`, the `MetricsBuilder.skipValidation` static flag (all already exist).
- Produces: `RowsSpecSchema` (exported from `options.schema.ts`), `validateRowsSpec(spec: unknown): RowsSpec` (exported from `options.schema.ts`), `RowsSpec = z.infer<typeof RowsSpecSchema>` (same exported name/shape as today — `{ dateColumn?: string }` — no consumer-visible change).

- [ ] **Step 1: Write the failing test**

Add to `test/from-rows.spec.ts`, in the existing `describe('MetricsBuilder.fromRows', ...)` block:

```ts
it('validates the RowsSpec dateColumn as a plain identifier', () => {
  expect(() => MetricsBuilder.fromRows(rows, { dateColumn: 'created_at; DROP TABLE orders' })).toThrow(
    ValidationError,
  );
});

it('validates MetricsOptions the same way queryExecutor does', () => {
  expect(() =>
    MetricsBuilder.fromRows(rows, {}, { locale: 'not a locale!!' }),
  ).toThrow(ValidationError);
});

it('validation is skippable via MetricsBuilder.skipValidation, like every other entry point', () => {
  MetricsBuilder.skipValidation = true;
  try {
    expect(() => MetricsBuilder.fromRows(rows, { dateColumn: 'created_at; DROP TABLE orders' })).not.toThrow();
  } finally {
    MetricsBuilder.skipValidation = false;
  }
});
```

Add the import at the top of `test/from-rows.spec.ts`:

```ts
import { ValidationError } from '@core/options.schema';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `docker compose run --rm dev npx vitest run test/from-rows.spec.ts`
Expected: FAIL — the malformed `dateColumn` currently reaches `assertSafeIdentifier` inside `dateColumn()` and throws `InvalidIdentifierException`, not `ValidationError`; the malformed `locale` currently isn't validated at all in rows mode (no `ValidationError` thrown, silently accepted).

- [ ] **Step 3: Add `RowsSpecSchema` + `validateRowsSpec`**

In `packages/core/src/options.schema.ts`, add after the existing `ExecutorSpecSchema` block (which uses the same `IdentifierSchema` this reuses):

```ts
/** Zod schema validating {@link RowsSpec} passed to `fromRows`. */
export const RowsSpecSchema = z.object({
  dateColumn: IdentifierSchema.optional(),
});

/** Declares which row property `fromRows` buckets on. Defaults to `'created_at'`. */
export type RowsSpec = z.infer<typeof RowsSpecSchema>;
```

Add a `validateRowsSpec` function after the existing `validateExecutorSpec` function (match its exact shape — read `validateExecutorSpec`'s current body in the file before writing this, so the error-formatting call and `ValidationError` construction match verbatim):

```ts
/**
 * Validate and narrow an unknown value to {@link RowsSpec}.
 * @param input - The value to validate.
 * @returns The parsed spec.
 * @throws {@link ValidationError} when `input` does not match the schema.
 */
export function validateRowsSpec(input: unknown): RowsSpec {
  const result = RowsSpecSchema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      `nestjs-metrics: invalid RowsSpec:\n${formatIssues(result.error.issues)}`,
      result.error.issues,
    );
  }
  return result.data;
}
```

- [ ] **Step 4: Re-point `datasource.ts`'s `RowsSpec` to the Zod-inferred type**

Read the current `RowsSpec` interface in `packages/core/src/datasource.ts` first (it's a plain `interface RowsSpec { dateColumn?: string }` re-added by the merge). Replace it with a re-export of the Zod-inferred type, mirroring exactly how `ExecutorSpec` is declared two lines above it in the same file:

```ts
export type RowsSpec = ZodRowsSpec;
```

Add `RowsSpec as ZodRowsSpec` to the existing `import type { ExecutorSpec as ZodExecutorSpec, ... } from './options.schema'` line at the top of the file (extend the existing import, don't add a second import statement).

- [ ] **Step 5: Call validation in `fromRows()`**

In `packages/core/src/metrics.builder.ts`, inside `static fromRows(...)`, add validation as the first statements (matching the `if (!MetricsBuilder.skipValidation) { ... }` pattern already used in the constructor and in `queryExecutor`):

```ts
static fromRows(
  rows: Record<string, unknown>[],
  spec: RowsSpec = {},
  options?: MetricsOptions,
): MetricsBuilder<ObjectLiteral> {
  if (!MetricsBuilder.skipValidation) {
    spec = validateRowsSpec(spec);
    validateMetricsOptions(options ?? {});
  }
  if (options?.cache?.enabled) {
    throw new ConfigurationError(
      'nestjs-metrics: caching is not supported with fromRows() — in-memory rows have no stable query identity to key a cache entry on.',
      'Remove options.cache (or set cache.enabled to false), or use query()/queryExecutor() if you need caching.',
      { operation: 'fromRows' },
    );
  }
  const builder = new MetricsBuilder<ObjectLiteral>(new RowsBackend(rows), 'rows', options);
  builder.rowsMode = true;
  if (spec.dateColumn) {
    builder.dateColumn(spec.dateColumn);
  }
  return builder;
}
```

(This keeps the existing cache-rejection check from the merge unchanged — validation runs first so a malformed `spec`/`options` fails with the same `ValidationError` shape every other entry point uses, before the cache check runs.)

Add `validateRowsSpec` to the existing `import { validateExecutorSpec, validateMetricsOptions } from './options.schema'` line at the top of `metrics.builder.ts` (extend the existing import).

- [ ] **Step 6: Run tests to verify they pass**

Run: `docker compose run --rm dev npx vitest run test/from-rows.spec.ts`
Expected: PASS, all tests including the three new ones.

- [ ] **Step 7: Run the full suite and typecheck**

Run: `docker compose run --rm dev npm test && docker compose run --rm dev npm run typecheck`
Expected: PASS, clean.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/options.schema.ts packages/core/src/datasource.ts packages/core/src/metrics.builder.ts test/from-rows.spec.ts
git commit -m "feat(core): validate fromRows() arguments with Zod, matching queryExecutor"
```

---

### Task 3: Extend the equivalence suite for master's new features

**Files:**
- Modify: `test/rows-equivalence.spec.ts`

**Interfaces:**
- Consumes: `MetricsBuilder.queryExecutor`/`MetricsBuilder.fromRows` (unchanged), the `SEED`/`ROWS` fixtures and `sql()`/`mem()`/`same()` helper already in the file.
- Produces: nothing new — pure regression coverage, same pattern as the existing six cases.

- [ ] **Step 1: Write the new equivalence cases**

Add to the existing `describe('SQL backend and RowsBackend answer identically', ...)` block in `test/rows-equivalence.spec.ts`, after the existing six `it()` cases:

```ts
it('countDistinct', () => same((b) => b.countDistinct('status'), 'metrics'));

it('cumulative trends', () =>
  same((b) => b.sumByMonth('amount', 0).forYear(2026).cumulative().fillMissingData()));

it('byHour bucketing', () =>
  same((b) =>
    b.countBetween(['2026-01-10', '2026-01-10'], 'id').groupByHour().fillMissingData(),
  ));

it('groupData auto-discovery (no explicit labels)', () =>
  same((b) => b.sumByMonth('amount', 0).forYear(2026).groupData().fillMissingData()));

it('a whereIn scope excludes out-of-scope labels from groupData auto-discovery', async () => {
  const scoped = () => sql().whereIn('status', ['paid', 'pending']).sumByMonth('amount', 0).forYear(2026).groupData();
  const scopedMem = () => mem().whereIn('status', ['paid', 'pending']).sumByMonth('amount', 0).forYear(2026).groupData();
  const [a, b] = await Promise.all([scoped().trends(), scopedMem().trends()]);
  expect(b).toEqual(a);
  expect(Object.keys((a as GroupedTrendsResult).data)).not.toContain('refunded');
});
```

Add the import needed for the last test's type assertion at the top of the file:

```ts
import type { GroupedTrendsResult } from '@core/types';
```

(Check the file's existing imports first — `MetricsBuilder`/`DataSource`/test helpers are already imported; only add what's missing.)

- [ ] **Step 2: Run the extended suite**

Run: `docker compose run --rm dev npx vitest run test/rows-equivalence.spec.ts`
Expected: PASS, all eleven cases (six existing + five new). Any failure here means a genuine SQL-vs-rows-mode divergence in the merged code (the `hour`/`COUNT_DISTINCT`/`cumulative`/`groupData`-auto-discovery paths this plan didn't otherwise touch) — diagnose against `packages/core/src/backend/rows.backend.ts` and `packages/core/src/metrics.builder.ts`, using the SQL-mode result as ground truth. Do not weaken an assertion to force a pass.

- [ ] **Step 3: Run the full suite (including multi-dialect) and typecheck**

Run: `docker compose run --rm dev npm test && docker compose run --rm dev npm run typecheck`

Then, for the multi-dialect gate:
```bash
docker compose up -d --wait postgres mysql
docker compose run --rm -e PG_HOST=postgres -e MYSQL_HOST=mysql dev npm test
docker compose down -v
```
Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add test/rows-equivalence.spec.ts
git commit -m "test(core): extend rows-equivalence suite for countDistinct/cumulative/byHour/groupData auto-discovery"
```

---

### Task 4: Refresh the release changeset

**Files:**
- Modify: `.changeset/fluent-where-rows-backend.md`

**Interfaces:**
- Consumes: nothing — content-only edit.
- Produces: the changeset Changesets will consume on the next `master` push to compute the version bump and `CHANGELOG.md` entry.

- [ ] **Step 1: Read the current changeset**

Read `.changeset/fluent-where-rows-backend.md` in full before editing — it currently only describes the original `where()`/`whereIn()`/`fromRows()` feature set, not this reconciliation's additions (Zod validation for `fromRows()`, `MetricsError`-hierarchy exceptions, the `resolveGroupLabels()` scoping fix, `hour`/`COUNT_DISTINCT` support in `RowsBackend`).

- [ ] **Step 2: Rewrite its body**

Keep the exact frontmatter (package names and `minor` bump, unchanged):

```markdown
---
'nestjs-metrics-core': minor
'nestjs-metrics': minor
'nextjs-metrics': minor
---

Add chainable `where()`/`whereIn()` structured filters (both modes, bound
parameters, empty IN fails closed) and a `fromRows()` entry point that runs
the full builder API over in-memory rows — bring-your-own-SQL with
timezone-correct bucketing, now including `hour` granularity and
`countDistinct()`. `fromRows()` arguments are Zod-validated like every other
entry point, and its exceptions (`InvalidRowDateException`,
`UnsupportedInRowsModeException`) are part of the standard `MetricsError`
hierarchy. `groupData()`'s auto-discovered label set now respects
`where()`/`whereIn()` scoping in both SQL and rows mode (it previously did
not, for either mode — a pre-existing gap closed as part of this change).

Internals: the builder emits a semantic query plan; SQL rendering moved into
the backends (generated SQL unchanged). Reconciled with the caching,
`hour` period, `COUNT_DISTINCT`, and typed-error work shipped in parallel.
```

- [ ] **Step 3: Verify and commit**

Run: `docker compose run --rm dev npm test`
Expected: PASS (changeset content doesn't affect tests; this just confirms nothing else broke).

```bash
git add .changeset/fluent-where-rows-backend.md
git commit -m "docs: refresh release changeset to cover the master-reconciliation additions"
```

---

## Self-review notes

- **Spec coverage:** design §3 (MetricsError migration, toSql already done by the merge) → Task 1; §6/§7 (Zod validation for fromRows) → Task 2; §8 (equivalence coverage for countDistinct/cumulative/byHour/groupData auto-discovery, including the scoping-leak regression) → Task 3; §10 (changeset refresh) → Task 4. §4/§5 (hour/COUNT_DISTINCT in RowsBackend, resolveGroupLabels scoping fix) were already completed and tested as part of the merge commit itself (`f9b8229`), per the merge reconciliation report — no separate task needed; Task 3 adds the equivalence-suite regression coverage for that already-shipped fix.
- **Known deviation surfaced by the merge, not by this plan:** the merge reconciliation report notes `resolveGroupLabels()` (unlike `canonicalLabels()`) correctly keeps period filters — the design doc's §5 text was imprecise about this distinction. No action needed; documented here so it isn't re-litigated.
- **Type consistency:** `RowsSpec`/`RowsSpecSchema`/`validateRowsSpec` names match across Task 2's steps; `InvalidRowDateException`/`UnsupportedInRowsModeException` constructor signatures are unchanged from Task 1 through the rest of the plan, so no other file needs updating for the migration.
