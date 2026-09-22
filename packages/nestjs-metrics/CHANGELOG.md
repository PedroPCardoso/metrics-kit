# nestjs-metrics

## 0.5.0

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

### Patch Changes

- Updated dependencies [e955129]
  - nestjs-metrics-core@0.4.0

## 0.4.1

### Patch Changes

- e4db44a: Improve SEO, positioning and developer experience: rewrite READMEs with badges, hero sections, feature lists and honest comparison tables; expand package.json keywords and descriptions; add production checklist and comparison docs; add runnable examples for NestJS/TypeORM, Next.js/Prisma and Next.js/Drizzle.
- Updated dependencies [e4db44a]
  - nestjs-metrics-core@0.3.1

## 0.4.0

### Minor Changes

- 50d5812: Add cache controls, safer validation and serialization, dual ESM/CJS package
  exports, coverage/Turbo CI tooling, and the new metrics CLI with local
  playground.

### Patch Changes

- Updated dependencies [50d5812]
  - nestjs-metrics-core@0.3.0

## 0.3.2

### Patch Changes

- 7cb2ae4: docs: add comprehensive NestJS usage guide (GUIA-NESTJS.md) and link to NestJ ReadMe

## 0.3.1

### Patch Changes

- 54f34d9: docs: add comprehensive NestJS usage guide (GUIA-NESTJS.md) and link to NestJ ReadMe

## 0.3.0

### Minor Changes

- 9bcdff7: Add contextual error handling. All errors now extend a shared `MetricsError` base
  class carrying a stable, machine-readable `code` and an optional structured
  `context`. Database failures are wrapped in a new `QueryExecutionError` that
  preserves the original error on `cause` and attaches the SQL, parameters and
  dialect that produced it. A new `ConfigurationError` (with an actionable
  `suggestion`) replaces the plain errors thrown for unsupported drivers and
  undetectable Drizzle dialects. The existing typed exceptions keep their names,
  messages and `instanceof Error` behaviour, so this is fully backward compatible.

### Patch Changes

- Updated dependencies [9bcdff7]
  - nestjs-metrics-core@0.2.0

## 0.2.5

### Patch Changes

- 86a4270: Add comprehensive JSDoc to the public API — the fluent `MetricsBuilder` (its
  factories, aggregates, period/range/grouping methods and async terminals), the
  repository and executor helpers, the exported enums and result types, the NestJS
  module/service and the Prisma/Drizzle adapters. Comments document parameters,
  return values, `@throws` and usage examples, and ship in the published `.d.ts`
  so they surface in editors. Also adds a TypeDoc `docs:api` script that generates
  an HTML API reference. Documentation-only; no runtime or signature changes.
- Updated dependencies [86a4270]
  - nestjs-metrics-core@0.1.1

## 0.2.2

### Patch Changes

- e4044a2: Restructure into the `@metrics-kit` monorepo. The metrics engine is extracted into
  `nestjs-metrics-core` (ORM-agnostic, dual-mode: TypeORM query builder or a raw-SQL
  executor for Prisma/Drizzle/any driver). `@pedropcardoso/metrics-nestjs` holds the NestJS
  module/service; `nextjs-metrics` adds Prisma and Drizzle adapters under
  isolated subpaths (`/prisma`, `/drizzle`) with optional peer deps. `nestjs-metrics`
  becomes a thin façade re-exporting `nestjs-metrics-core` (`.`) and `@pedropcardoso/metrics-nestjs`
  (`./nestjs`) — no public API change.
- Updated dependencies [e4044a2]
  - nestjs-metrics-core@0.2.0
  - @pedropcardoso/metrics-nestjs@0.2.0
