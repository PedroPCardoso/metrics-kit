# nestjs-metrics-core

The ORM-agnostic metrics & trends engine and its fluent API. Two entry points:

- `Metrics.query(qb)` — over a **TypeORM** `SelectQueryBuilder`.
- `Metrics.queryExecutor(dataSource, spec)` — over **any driver** via a
  `(sql, params) => rows` executor (the basis of the Prisma/Drizzle adapters in
  [`nextjs-metrics`](../nextjs)).

```bash
npm i nestjs-metrics-core
```

`typeorm` is an **optional** peer — only needed for the `Metrics.query` path.
The terminals (`metrics()`, `trends()`, `metricsWithVariations()`) are **async**.

## Entry points

### TypeORM query builder

```ts
import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics-core';

await Metrics.query(orderRepo.createQueryBuilder('orders')).sum('amount').byMonth().forYear(2026).trends();
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

### Scoping with `where` / `whereIn`

Every query the builder runs can be AND-scoped with structured, parameter-bound
filters — the hook for multi-tenant / visibility gates:

```ts
// A gate wraps the builder and injects the caller's visible ids:
const scoped = Metrics.queryExecutor(db, { table: 'donations', dateColumn: 'created_at' })
  .whereIn('member_id', visibleIds)   // array → IN (…), every value bound
  .where('status', 'confirmed')       // scalar → equality
  .where('amount', { gte: 0 });       // object → range (gte/lte/gt/lt); null → IS NULL

await scoped.sumByMonth('amount', 12).fillMissingData().trends();
```

Guarantees: values only ever travel as bound parameters; column names are
validated and driver-escaped; an **empty `whereIn` list matches nothing**
(fail closed). Also available in TypeORM mode and as
`queryExecutor(ds, { …, where: { member_id: visibleIds } })`.

### Bring your own SQL: `fromRows`

When your query layer must own 100% of the SQL (Kysely, raw pg, an
architecture rule that every read goes through a scoped query), hand the
builder the rows and let it do the hard part — period bucketing, gap fill,
timezone-correct month boundaries, labels, variations:

```ts
const rows = await scopedQuery.selectFrom('donations').selectAll().execute();

await Metrics.fromRows(rows, { dateColumn: 'created_at' }, { timezone: 'America/Sao_Paulo' })
  .sumByMonth('amount', 12)
  .fillMissingData()
  .trends(); // identical output to the SQL modes, verified by an equivalence suite
```

`dateColumn` accepts `Date`, ISO strings or epoch milliseconds. The full
fluent API works (`count/sum/average/max/min`, periods, `between`,
`labelColumn`, `groupData`, `metricsWithVariations`, `where`/`whereIn`).
An unparseable date throws `InvalidRowDateException` naming the row index;
`.table()` throws `UnsupportedInRowsModeException`.

### Errors

Typed exceptions: `InvalidAggregateException`, `InvalidPeriodException`,
`InvalidDateFormatException`, `InvalidVariationsCountException`,
`InvalidIdentifierException`, `InvalidTimezoneException`,
`SqliteTimezoneUnsupportedException`, `InvalidRowDateException`,
`UnsupportedInRowsModeException`. Identifiers are validated and escaped —
keep them developer-controlled, not user input.

## License

MIT
