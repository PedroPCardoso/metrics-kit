# nextjs-metrics

[![npm version](https://img.shields.io/npm/v/nextjs-metrics)](https://www.npmjs.com/package/nextjs-metrics)
[![npm downloads](https://img.shields.io/npm/dm/nextjs-metrics)](https://www.npmjs.com/package/nextjs-metrics)
[![license](https://img.shields.io/npm/l/nextjs-metrics)](https://github.com/PedroPCardoso/metrics-kit/blob/master/LICENSE)
[![types](https://img.shields.io/npm/types/nextjs-metrics)](https://www.npmjs.com/package/nextjs-metrics)
[![CI](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml)

Chart-ready **metrics** and **trends** for **Prisma** and **Drizzle**, usable from
Next.js Server Components, Route Handlers or any Node runtime. Built on
[`nestjs-metrics-core`](https://github.com/PedroPCardoso/metrics-kit/tree/master/packages/core).

```ts
import { prismaMetrics } from 'nextjs-metrics/prisma';

await prismaMetrics(prisma, { table: 'orders', dateColumn: 'created_at', dialect: 'postgres' })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
// → { labels: ['January', ...], data: [...] }
```

## Features

- **Prisma, Drizzle & Kysely adapters** in one package, with isolated subpaths so importing one never loads the others.
- **Typed schema inference** for Drizzle — pass table/column objects and the dialect is detected automatically.
- **Database portability** — same API on PostgreSQL, MySQL/MariaDB, SQLite, and SQL Server (MSSQL).
- **Locale & timezone aware** — translated labels and DST-correct bucketing.
- **Chart-ready output** — `trends()` returns `{ labels, data }` ready for chart libraries, with `toChartJs` / `toApexCharts` / `toRecharts` helpers.
- **Built-in helpers** — `fillMissingData`, `groupData` (with auto-discover), `countDistinct`, `cumulative`, `metricsWithVariations`, `trendsWithComparison`, percentage trends.

## Installation

```bash
npm install nextjs-metrics
```

Install only the ORM you use:

```bash
npm install @prisma/client      # for Prisma
npm install drizzle-orm         # for Drizzle
```

`@prisma/client` and `drizzle-orm` are **optional peers** — `drizzle-orm` is
loaded lazily, so Prisma users never need it. The terminals (`metrics()`,
`trends()`) are **async**.

## Prisma

```ts
import { prismaMetrics } from 'nextjs-metrics/prisma';

// Prisma can't report its provider at runtime — state the dialect.
const builder = prismaMetrics(prisma, {
  table: 'orders',
  dateColumn: 'created_at',
  dialect: 'postgres',          // 'postgres' | 'mysql' | 'sqlite'
  where: { status: 'paid' },    // optional structured filter
});

await builder.sum('amount').metrics();
await builder.sumByMonth('amount').forYear(2026).fillMissingData().trends();
```

The emitted SQL runs through `prisma.$queryRawUnsafe`; values bind positionally.

## Drizzle

Pass the typed table/column objects — SQL names and **dialect** are inferred:

```ts
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { orders } from './schema';

await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt })
  .countByMonth()
  .forYear(2026)
  .trends();
```

Or strings with an explicit `dialect`:

```ts
await drizzleMetrics(db, { table: 'orders', dateColumn: 'created_at', dialect: 'sqlite' })
  .count()
  .metrics();
```

Runs through the underlying driver Drizzle wraps (`db.$client`): `better-sqlite3`,
`node-postgres`, or `mysql2`.

## Kysely

```ts
import { kyselyMetrics } from 'nextjs-metrics/kysely';

const builder = kyselyMetrics(db, {
  table: 'orders',
  dateColumn: 'created_at',
  dialect: 'postgres',          // 'postgres' | 'mysql' | 'sqlite' | 'mssql'
  where: { status: 'paid' },    // optional structured filter
});

await builder.sumByMonth('amount').forYear(2026).fillMissingData().trends();
```

`kyselyMetrics` accepts any Kysely instance (duck-typed via `executeQuery`). The
dialect must be stated explicitly because Kysely does not expose it at runtime.

## Filters

`where` supports equality, `IN`, range and `IS NULL`:

```ts
{ where: { status: 'paid' } }                 // status = ?
{ where: { status: ['paid', 'pending'] } }    // status IN (?, ?)
{ where: { amount: { gte: 100, lt: 500 } } }  // range
{ where: { customer_id: null } }              // IS NULL
```

For joins the structured shape can't express, pass a raw `from` fragment (a
**trusted developer surface** — never interpolate user input).

## Chart Helpers

```ts
import { toChartJs, toApexCharts, toRecharts } from 'nextjs-metrics';

const trends = await prismaMetrics(prisma, { table: 'orders', dateColumn: 'created_at', dialect: 'postgres' })
  .countByMonth()
  .forYear(2026)
  .trends();

// Chart.js
const chartJsConfig = toChartJs(trends, { label: 'Orders', type: 'line' });

// ApexCharts
const apexConfig = toApexCharts(trends, { name: 'Orders' });

// Recharts
const rechartsData = toRecharts(trends);
// → [{ label: 'January', value: 10 }, ...]
```

All three helpers also accept `GroupedTrendsResult` and `TrendsComparisonResult`.

## SQL Introspection (toSql)

```ts
const sql = builder.toSql();                   // rendered SQL with values
const sql = builder.toSql({ mask: true });     // values redacted for logs
const trendsSql = builder.toTrendsSql();       // trends variant
```

## Variations

```ts
import { Period } from 'nextjs-metrics';

const result = await prismaMetrics(prisma, { table: 'orders', dateColumn: 'created_at', dialect: 'postgres' })
  .sumByYear('amount', 1)
  .forYear(2026)
  .metricsWithVariations(1, Period.YEAR, true);
// → { count: 100000, variation: { type: 'increase', value: '15.5%' } }
```

## Why nextjs-metrics?

| Feature | nextjs-metrics | Prisma aggregates | Drizzle raw SQL |
|---|---|---|---|
| Time-series trends | Yes | Manual | Manual |
| Multi-dialect date bucketing | Yes | Manual | Manual |
| Locale/timezone labels | Yes | No | No |
| `fillMissingData` / `groupData` | Yes | Manual | Manual |
| Works in Next.js / any Node runtime | Yes | Yes | Yes |

**Use nextjs-metrics** when you want a reusable metrics DSL over Prisma or Drizzle
without hand-writing date-bucketing SQL for every chart.

## Notes

- **Dialects:** `'postgres'`, `'mysql'`, `'sqlite'`, and `'mssql'` (SQL Server) are supported. MSSQL uses `DATEPART` / `CONVERT` / `AT TIME ZONE`.
- **Timezone:** Postgres/MySQL/MSSQL get full timezone-aware bucketing; SQLite is
  UTC-only in executor mode (a non-UTC timezone throws).
- **Safety:** identifiers are validated against an allowlist and quoted per
  dialect; all values bind as parameters.

The standalone engine (incl. `Metrics`/`metricsFor`) is also re-exported here, and
documented in [`nestjs-metrics-core`](https://github.com/PedroPCardoso/metrics-kit/tree/master/packages/core).

## License

MIT
