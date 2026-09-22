---
'nestjs-metrics': patch
'nestjs-metrics-core': patch
---

Mark `typeorm` as an **optional** peer dependency of `nestjs-metrics`, matching
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
