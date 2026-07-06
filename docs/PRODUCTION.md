# Production checklist

A short guide to running Metrics Kit safely and efficiently in production.

## Configuration

### Set locale and timezone globally

Configure `locale` and `timezone` once in `MetricsModule.forRoot` (NestJS) or
per entry point (Next.js / standalone). This keeps dashboard labels consistent
and avoids silent timezone bugs caused by the database connection default.

```ts
MetricsModule.forRoot({
  locale: 'pt-BR',
  timezone: 'America/Sao_Paulo',
});
```

You can override per module with `forFeature` or per query with call-site
options. Precedence:

**call-site option > forFeature > forRoot > library default (`en` / `UTC`)**

## Avoid high-cardinality labels

`labelColumn` is powerful for grouping by status, plan, category, etc. Never use
it with high-cardinality or user-controlled values such as:

- Raw user IDs
- Email addresses
- Dynamic URLs or path parameters
- Free-text fields

High-cardinality labels can explode memory usage and make charts unusable.

## Fill missing data for charts

`.trends()` only returns buckets that exist in the database. Use
`fillMissingData()` so your chart library receives a complete series:

```ts
await this.metrics
  .query(qb)
  .countByMonth()
  .forYear(2026)
  .fillMissingData()
  .trends();
```

## Cache hot queries

Dashboard endpoints are often read-heavy and tolerant of slightly stale data.
Use a custom `CacheStore` (e.g., Redis) for hot metrics:

```ts
const cache = new RedisCacheStore();

await Metrics.query(qb, { cache: { enabled: true, ttl: 300 } }, cache)
  .sumByMonth('amount')
  .trends();
```

## Test against your production dialect

Date and timezone SQL differs across PostgreSQL, MySQL/MariaDB and SQLite. Run
your test suite against the same dialect you deploy on, especially if you use
non-UTC timezones or ISO-week bucketing.

## Validate identifiers

Metrics Kit validates column/table names against an allowlist and escapes them
per driver. Do not relax this guard or pass user input directly as identifiers.
Values are always bound as parameters, but identifiers cannot be parameterized
in SQL.

## Secure dashboard endpoints

Metrics Kit produces data payloads, not HTTP endpoints. Make sure the routes that
expose metrics data are behind your application's authentication and
authorization layers.

## Summary

- [ ] Set `locale` and `timezone` in `forRoot`.
- [ ] Use `fillMissingData()` for time-series charts.
- [ ] Use `groupData()` for stacked series instead of multiple queries.
- [ ] Keep `labelColumn` values low-cardinality.
- [ ] Enable caching for hot dashboards.
- [ ] Test against the real database dialect.
- [ ] Do not pass user input as SQL identifiers.
- [ ] Protect dashboard/metrics endpoints with auth.
