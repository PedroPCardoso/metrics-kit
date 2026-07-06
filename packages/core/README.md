# nestjs-metrics-core

[![npm version](https://img.shields.io/npm/v/nestjs-metrics-core)](https://www.npmjs.com/package/nestjs-metrics-core)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-metrics-core)](https://www.npmjs.com/package/nestjs-metrics-core)
[![license](https://img.shields.io/npm/l/nestjs-metrics-core)](https://github.com/PedroPCardoso/metrics-kit/blob/master/LICENSE)
[![types](https://img.shields.io/npm/types/nestjs-metrics-core)](https://www.npmjs.com/package/nestjs-metrics-core)
[![CI](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml)

The **ORM-agnostic metrics & trends engine** and its fluent API. Build chart-ready
time-series from **TypeORM**, **Prisma**, **Drizzle** or any SQL driver, with the
same API across **PostgreSQL**, **MySQL/MariaDB** and **SQLite**.

```ts
import { Metrics } from 'nestjs-metrics-core';

await Metrics.query(orderRepo.createQueryBuilder('orders'))
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
// → { labels: ['January', ...], data: [...] }
```

## Features

- **Dual-mode engine** — `Metrics.query(qb)` over TypeORM, or `Metrics.queryExecutor(...)` over any driver.
- **Database portability** — one API emits the right SQL for Postgres, MySQL and SQLite.
- **Locale & timezone aware** — translated labels and DST-correct bucketing.
- **Chart-ready output** — `trends()` returns `{ labels, data }` directly usable by chart libraries.
- **Output helpers** — `fillMissingData`, `groupData`, `metricsWithVariations`, percentage trends.
- **Typed errors** — every error exposes a stable `code` for programmatic handling.
- **Identifier safety** — built-in allowlist + driver escaping protects against SQL identifier injection.

## Installation

```bash
npm install nestjs-metrics-core
```

`typeorm` is an **optional** peer — only needed for the `Metrics.query` path.
The terminals (`metrics()`, `trends()`, `metricsWithVariations()`) are **async**.

## Entry points

### TypeORM query builder

```ts
import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics-core';

await Metrics.query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .byMonth()
  .forYear(2026)
  .trends();

await metricsFor(orderRepo).count().byYear().metrics();           // repository helper
await withMetrics(orderRepo).metrics().countByMonth().trends();   // extend the repo
```

### Any driver (executor mode)

```ts
import { Metrics, type DataSource } from 'nestjs-metrics-core';

const dataSource: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then((r) => r.rows),
};

await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

## API overview

### Aggregates · Periods · Reference point

```ts
.count(column = 'id')  .sum(column)  .average(column)  .max(column)  .min(column)
.byDay(count = 0)  .byWeek(count = 0)  .byMonth(count = 0)  .byYear(count = 0)
.forDay(d)  .forWeek(w /* ISO week */)  .forMonth(m)  .forYear(y)
```

`count = 0` → the whole period · `count = 1` → a single unit · `count > 1` → the
last-`n` window.

### Date ranges · Targeting

```ts
.between(start, end /* 'YYYY-MM-DD' */)  .from(date)
.groupByDay() | .groupByWeek() | .groupByMonth() | .groupByYear()
.dateColumn(column)  .table(name)  .labelColumn(column)
```

### Outputs · Modifiers

```ts
.metrics()                                  // → number
.trends(inPercent = false)                  // → { labels, data }
.metricsWithVariations(prevCount, prevPeriod, inPercent = false)
.fillMissingData(value = 0, labels = [])
.groupData(labels, aggregate = Aggregate.SUM)   // multi-series → { total, [label]: [] }
```

### Combined shorthands

```ts
.countByMonth(column?, count?)   .sumByYear(column, count?)   .averageByWeek(column, count?)
.countBetween([start, end], column?)   .sumFrom(date, column)   // …all by-period/Between/From shorthands
```

### Locale & timezone

```ts
Metrics.query(qb, { locale: 'pt-BR', timezone: 'America/Sao_Paulo' });
```

Labels are translated via the locale (default `en`). A non-UTC `timezone`
converts the date column before bucketing (DST-correct) on Postgres/MySQL; on
SQLite, timezone conversion is supported via the TypeORM path but **not** the
executor mode (which is UTC-only and throws on a non-UTC timezone).

### Caching

```ts
import { MemoryCacheStore } from 'nestjs-metrics-core';

const cache = new MemoryCacheStore();
await Metrics.query(qb, { cache: { enabled: true, ttl: 60 } }, cache)
  .count()
  .metrics();
```

Implement the `CacheStore` interface to plug in Redis or any backend.

## Errors

Typed exceptions: `InvalidAggregateException`, `InvalidPeriodException`,
`InvalidDateFormatException`, `InvalidVariationsCountException`,
`InvalidIdentifierException`, `InvalidTimezoneException`,
`SqliteTimezoneUnsupportedException`. Identifiers are validated and escaped —
keep them developer-controlled, not user input.

See the [error codes reference](https://github.com/PedroPCardoso/metrics-kit/blob/master/docs/ERROR_CODES.md) for the full table.

## Adapters

- **NestJS + TypeORM** — [`nestjs-metrics`](https://github.com/PedroPCardoso/metrics-kit/tree/master/packages/nestjs-metrics)
- **Next.js + Prisma/Drizzle** — [`nextjs-metrics`](https://github.com/PedroPCardoso/metrics-kit/tree/master/packages/nextjs-metrics)

## License

MIT
