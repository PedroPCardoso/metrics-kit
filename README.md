# nestjs-metrics

Generate **metrics** (aggregate values) and **trends** (chart-ready time series)
from your database, through a fluent API — a TypeScript port of
[`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics).

One package, four entry points — use whichever fits your stack. The engine is
**ORM-agnostic**: the same fluent API runs over TypeORM, Prisma or Drizzle.

| Import | For | Optional peer |
| --- | --- | --- |
| `nestjs-metrics` | the engine + fluent API (TypeORM or any driver) | `typeorm` |
| `nestjs-metrics/nestjs` | the NestJS module + service | `@nestjs/common` |
| `nestjs-metrics/prisma` | the Prisma adapter | `@prisma/client` |
| `nestjs-metrics/drizzle` | the Drizzle adapter | `drizzle-orm` |

```bash
npm install nestjs-metrics
```

Every peer is optional — install only the one(s) you use. The terminals
(`metrics()`, `trends()`, `metricsWithVariations()`) are **async**.

## Usage

### NestJS / TypeORM

```ts
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';

@Module({ imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })] })
export class AppModule {}

// inside a provider:
this.metrics.query(orderRepo.createQueryBuilder('orders'))
  .sumByMonth('amount', 12).forYear(2026).fillMissingData().trends();
```

### Standalone (TypeORM query builder)

```ts
import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics';

await Metrics.query(orderRepo.createQueryBuilder('orders')).sum('amount').byMonth().forYear(2026).trends();
await metricsFor(orderRepo).count().metrics();
```

### Prisma

```ts
import { prismaMetrics } from 'nestjs-metrics/prisma';

await prismaMetrics(prisma, { table: 'orders', dateColumn: 'created_at', dialect: 'postgres' })
  .sumByMonth('amount').forYear(2026).fillMissingData().trends();
```

### Drizzle (typed table → names + dialect inferred)

```ts
import { drizzleMetrics } from 'nestjs-metrics/drizzle';
import { orders } from './schema';

await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt }).sum('amount').metrics();
```

### Any driver (executor mode)

```ts
import { Metrics, type DataSource } from 'nestjs-metrics';

const dataSource: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then((r) => r.rows),
};
await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount').forYear(2026).trends();
```

## API

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

### Structured filters (executor mode)

```ts
{ where: { status: 'paid' } }                 // status = ?
{ where: { status: ['paid', 'pending'] } }    // status IN (?, ?)
{ where: { amount: { gte: 100, lt: 500 } } }  // range
{ where: { customer_id: null } }              // IS NULL
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
SQLite this works through the TypeORM path but **not** the executor mode (UTC-only).

### Errors

Typed exceptions: `InvalidAggregateException`, `InvalidPeriodException`,
`InvalidDateFormatException`, `InvalidVariationsCountException`,
`InvalidIdentifierException`, `InvalidTimezoneException`,
`SqliteTimezoneUnsupportedException`. Identifiers are validated and escaped —
keep them developer-controlled, not user input.

> Intentional differences from the original Laravel library are in
> [DIVERGENCES.md](./DIVERGENCES.md); architecture in [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

## Development

Everything runs in Docker:

```bash
docker compose run --rm dev npm install
docker compose run --rm dev npm test            # SQLite
docker compose up -d --wait postgres mysql
bash scripts/load-mysql-tz.sh                    # MySQL named timezones (for tz tests)
docker compose run --rm -e PG_HOST=postgres -e MYSQL_HOST=mysql dev npm test
```

## License

MIT
