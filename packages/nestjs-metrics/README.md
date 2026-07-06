# nestjs-metrics

[![npm version](https://img.shields.io/npm/v/nestjs-metrics)](https://www.npmjs.com/package/nestjs-metrics)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-metrics)](https://www.npmjs.com/package/nestjs-metrics)
[![license](https://img.shields.io/npm/l/nestjs-metrics)](https://github.com/PedroPCardoso/metrics-kit/blob/master/LICENSE)
[![types](https://img.shields.io/npm/types/nestjs-metrics)](https://www.npmjs.com/package/nestjs-metrics)
[![CI](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml)

Chart-ready **metrics** and **trends** from your **TypeORM** entities in **NestJS**.
A fluent, database-portable API for dashboards and analytics — built on
[`nestjs-metrics-core`](https://github.com/PedroPCardoso/metrics-kit/tree/master/packages/core).

```ts
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';

this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sumByMonth('amount', 12)
  .forYear(2026)
  .fillMissingData()
  .trends();
// → { labels: ['January', ...], data: [...] }
```

## Features

- **Fluent API** for `count`, `sum`, `average`, `max`, `min` over day/week/month/year.
- **Two entry points** — `nestjs-metrics` (engine) and `nestjs-metrics/nestjs` (NestJS module).
- **Chart-ready output** — `trends()` returns `{ labels, data }` for Chart.js, Recharts, ApexCharts, etc.
- **Multi-dialect SQL** — identical queries on PostgreSQL, MySQL/MariaDB and SQLite.
- **Locale & timezone aware** — translated labels and DST-correct bucketing.
- **Built-in helpers** — `fillMissingData`, `groupData` (stacked series), `metricsWithVariations`, percentage trends.
- **NestJS integration** — global `MetricsModule.forRoot`, per-module `forFeature`, injectable `MetricsService`.
- **Repository helpers** — `metricsFor(repo)` and `withMetrics(repo)`.

## Installation

```bash
npm install nestjs-metrics typeorm
```

Peer dependencies (your project already has them):

- `@nestjs/common` ^10 || ^11
- `typeorm` ^0.3

`nestjs-metrics-core` is installed automatically.

## Quick start

Register the module globally:

```ts
import { Module } from '@nestjs/common';
import { MetricsModule } from 'nestjs-metrics/nestjs';

@Module({
  imports: [
    MetricsModule.forRoot({
      locale: 'pt-BR',
      timezone: 'America/Sao_Paulo',
    }),
  ],
})
export class AppModule {}
```

Inject the service and build a trend:

```ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MetricsService } from 'nestjs-metrics/nestjs';
import { Order } from './order.entity';

@Injectable()
export class DashboardService {
  constructor(
    private readonly metrics: MetricsService,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
  ) {}

  async monthlyRevenue() {
    return this.metrics
      .query(this.orders.createQueryBuilder('orders'))
      .sumByMonth('amount', 12)
      .forYear(2026)
      .fillMissingData()
      .trends();
  }
}
```

## Common examples

### Single metric

```ts
const total = await this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sum('amount')
  .metrics();
// → number
```

### Current month only

```ts
const thisMonth = await this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .countByMonth(1)
  .metrics();
```

### Group by status

```ts
const byStatus = await this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .count()
  .labelColumn('status')
  .forYear(2026)
  .trends();
// → { labels: ['pending', 'paid', ...], data: [...] }
```

### Stacked series

```ts
const stacked = await this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .countByMonth('status', 6)
  .groupData(['pending', 'paid', 'cancelled'])
  .fillMissingData()
  .trends();
// → { labels: [...], data: { total: [...], pending: [...], paid: [...], cancelled: [...] } }
```

### Variation vs previous period

```ts
import { Period } from 'nestjs-metrics';

const result = await this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sumByYear('amount', 1)
  .forYear(2026)
  .metricsWithVariations(1, Period.YEAR, true);
// → { count: 100000, variation: { type: 'increase', value: '15.5%' } }
```

## Entry points

| Import | For | Optional peer |
| --- | --- | --- |
| `nestjs-metrics` | the engine + fluent API | `typeorm` |
| `nestjs-metrics/nestjs` | the NestJS module + service | `@nestjs/common` |

`MetricsModule.forRoot` is global; `MetricsModule.forFeature({ locale, timezone })`
overrides within a feature module. Precedence:
**call option > forFeature > forRoot > library default** (`en` / `UTC`).

## Standalone usage

You do not need NestJS to use the engine:

```ts
import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics';

await Metrics.query(orderRepo.createQueryBuilder('orders'))
  .count()
  .metrics();

await metricsFor(orderRepo).sumByMonth('amount').trends();

const repo = withMetrics(orderRepo);
await repo.metrics().countByMonth().trends();
```

The full fluent API is documented in [`nestjs-metrics-core`](../core).

## Why nestjs-metrics?

| Feature | nestjs-metrics | Raw TypeORM QueryBuilder | `laravel-metrics` |
|---|---|---|---|
| NestJS module | Yes | No | No |
| Fluent metrics/trends API | Yes | Partial | Yes |
| Locale/timezone bucketing | Yes | Manual | Yes |
| `fillMissingData` / `groupData` | Yes | Manual | Yes |
| PostgreSQL / MySQL / SQLite | Yes | Yes* | Yes |
| TypeScript-first | Yes | Yes | No (PHP) |

\* TypeORM supports all three drivers, but date-bucketing SQL is your responsibility.

**Use nestjs-metrics** when you want a reusable, tested DSL for dashboard metrics
instead of writing and maintaining date-bucketing SQL by hand.

## Production tips

- Set `locale` and `timezone` in `forRoot` once, override with `forFeature` per module.
- Use `fillMissingData()` so charts never collapse missing buckets.
- Keep `labelColumn` values low-cardinality; never use user IDs or dynamic URLs as labels.
- Enable caching with a Redis `CacheStore` for hot dashboards.
- Run your test suite against the real dialect you deploy on; date/time SQL is not identical across drivers.

## NestJS guide

For a comprehensive walkthrough of all features, queries, filters and usage
patterns, see [`docs/GUIA-NESTJS.md`](https://github.com/PedroPCardoso/metrics-kit/blob/master/docs/GUIA-NESTJS.md) (Portuguese) and the
[NestJ ReadMe](https://nestjs-metrics.readme.io/docs/getting-started) site (English).

## License

MIT
