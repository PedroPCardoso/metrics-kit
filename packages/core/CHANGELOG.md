# nestjs-metrics-core

## 0.5.2

### Patch Changes

- 823a0f2: Docs: make the driver adapters discoverable from the NestJS side. A consumer on
  NestJS + Kysely guessed `nestjs-metrics/kysely`, hit an unexported subpath, and
  had to go looking for the right specifier — the adapters (`prismaMetrics`,
  `drizzleMetrics`, `kyselyMetrics`) are only reachable from `nextjs-metrics`,
  whose name gives no hint that it is runtime-agnostic rather than Next.js-specific.

  The core README's adapter list also still said "Next.js + Prisma/Drizzle",
  predating the Kysely adapter. Both READMEs and the NestJS guide now state where
  the adapters live, that the package works in any Node runtime, and that adapters
  bypass `MetricsService` (so module-level locale/timezone defaults don't apply —
  use `metricsService.queryExecutor(...)` when you want them). No API change.

## 0.5.1

### Patch Changes

- 1ddad34: Mark `typeorm` as an **optional** peer dependency of `nestjs-metrics`, matching
  `nestjs-metrics-core`. The package never imports `typeorm` at runtime — its only
  reference is a type-only import of `ObjectLiteral`/`SelectQueryBuilder`, which the
  build elides, so the published CJS/ESM entry points require nothing but
  `@nestjs/common` and `nestjs-metrics-core`. Declaring it as a required peer
  misrepresented the package to anyone on a non-TypeORM stack (Kysely, Prisma,
  Drizzle, raw SQL) who only needs `queryExecutor()` or `fromRows()`.

  Docs: `toSql()`/`toTrendsSql()` now warn that the unmasked output interpolates
  bound values, so a scoped query renders its scope inline (`IN ('a','b')`) and must
  not be logged without `{ mask: true }`. Also documents `fromRows()`'s in-memory
  sizing trade-off (and when an indicator should go back to SQL aggregation) and how
  to choose between `fromRows()` and `where()`/`whereIn()` when a visibility scope is
  involved.

## 0.5.0

### Minor Changes

- cba649d: Add chainable `where()`/`whereIn()` structured filters (both modes, bound
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

## 0.4.0

### Minor Changes

- e955129: Release the merged metrics feature batch:

  - add hourly granularity across dialects;
  - add `countDistinct()`, `cumulative()`, `trendsWithComparison()` and `toSql()`;
  - add grouped trend label auto-discovery;
  - add chart output helpers under `nestjs-metrics-core/charts`;
  - add query observability hooks and async cache-store support;
  - add MSSQL dialect support;
  - add the `nextjs-metrics/kysely` adapter;
  - add NestJS and Next.js dashboard example apps.

## 0.3.1

### Patch Changes

- e4db44a: Improve SEO, positioning and developer experience: rewrite READMEs with badges, hero sections, feature lists and honest comparison tables; expand package.json keywords and descriptions; add production checklist and comparison docs; add runnable examples for NestJS/TypeORM, Next.js/Prisma and Next.js/Drizzle.

## 0.3.0

### Minor Changes

- 50d5812: Add cache controls, safer validation and serialization, dual ESM/CJS package
  exports, coverage/Turbo CI tooling, and the new metrics CLI with local
  playground.

## 0.2.0

### Minor Changes

- 9bcdff7: Add contextual error handling. All errors now extend a shared `MetricsError` base
  class carrying a stable, machine-readable `code` and an optional structured
  `context`. Database failures are wrapped in a new `QueryExecutionError` that
  preserves the original error on `cause` and attaches the SQL, parameters and
  dialect that produced it. A new `ConfigurationError` (with an actionable
  `suggestion`) replaces the plain errors thrown for unsupported drivers and
  undetectable Drizzle dialects. The existing typed exceptions keep their names,
  messages and `instanceof Error` behaviour, so this is fully backward compatible.

## 0.1.1

### Patch Changes

- 86a4270: Add comprehensive JSDoc to the public API — the fluent `MetricsBuilder` (its
  factories, aggregates, period/range/grouping methods and async terminals), the
  repository and executor helpers, the exported enums and result types, the NestJS
  module/service and the Prisma/Drizzle adapters. Comments document parameters,
  return values, `@throws` and usage examples, and ship in the published `.d.ts`
  so they surface in editors. Also adds a TypeDoc `docs:api` script that generates
  an HTML API reference. Documentation-only; no runtime or signature changes.

## 0.2.0

### Minor Changes

- e4044a2: Restructure into the `@metrics-kit` monorepo. The metrics engine is extracted into
  `nestjs-metrics-core` (ORM-agnostic, dual-mode: TypeORM query builder or a raw-SQL
  executor for Prisma/Drizzle/any driver). `@pedropcardoso/metrics-nestjs` holds the NestJS
  module/service; `nextjs-metrics` adds Prisma and Drizzle adapters under
  isolated subpaths (`/prisma`, `/drizzle`) with optional peer deps. `nestjs-metrics`
  becomes a thin façade re-exporting `nestjs-metrics-core` (`.`) and `@pedropcardoso/metrics-nestjs`
  (`./nestjs`) — no public API change.
