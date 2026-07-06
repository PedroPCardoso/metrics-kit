# Comparison

How Metrics Kit compares to common alternatives for building dashboard metrics
and trends in TypeScript / Node.

## Metrics Kit vs raw SQL

| Capability | Metrics Kit | Raw SQL |
|---|---|---|
| Fluent, chainable API | Yes | No |
| Type-safe identifiers | Yes | Manual |
| Multi-dialect date bucketing | Yes | Manual |
| Locale/timezone labels | Built-in | Manual |
| `fillMissingData` / `groupData` | Built-in | Manual |
| Tested against real DBs in CI | Yes | Up to you |

Raw SQL is always the most flexible option, but it puts the burden of writing,
reviewing and maintaining date-bucketing queries on your team. Metrics Kit turns
common dashboard patterns into a small, tested DSL.

## Metrics Kit vs ORM-native aggregates

| Capability | Metrics Kit | TypeORM QueryBuilder | Prisma aggregates | Drizzle raw SQL |
|---|---|---|---|---|
| Time-series trends (`{ labels, data }`) | Yes | Manual | Manual | Manual |
| Locale/timezone bucketing | Built-in | Manual | Not supported | Manual |
| `fillMissingData` | Built-in | Manual | Manual | Manual |
| `groupData` multi-series | Built-in | Manual | Manual | Manual |
| Cross-dialect portability | Yes | Partial | Partial | Partial |
| NestJS module | Yes | No | No | No |
| Next.js adapters | Yes | No | No | No |

ORM-native aggregates are great for simple filters or single values. Metrics Kit
shines when you repeatedly turn database rows into chart-ready time-series.

## Metrics Kit vs `laravel-metrics`

Metrics Kit is a TypeScript port of [`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics).

| Capability | Metrics Kit | `laravel-metrics` |
|---|---|---|
| Language | TypeScript | PHP |
| Runtime | Node.js / NestJS / Next.js | Laravel / PHP |
| Type safety | Full TypeScript API | PHP type hints |
| Async terminals | Yes (required by Node DB drivers) | No (PHP synchronous) |
| ORM support | TypeORM, Prisma, Drizzle | Eloquent / Query Builder |
| Dialects | PostgreSQL, MySQL/MariaDB, SQLite | PostgreSQL, MySQL, SQLite |

## When to use Metrics Kit

Choose Metrics Kit when:

- You build dashboards or admin panels that need time-series data.
- You want the same metrics DSL across NestJS, Next.js or standalone Node.
- You run on PostgreSQL, MySQL/MariaDB or SQLite and do not want to maintain
  dialect-specific date SQL.
- You need locale-aware labels or timezone-correct bucketing.

## When to use something else

Consider alternatives when:

- You only need a single, one-off aggregation.
- Your ORM's native aggregates already cover the use case.
- You are building a Laravel/PHP application and prefer the original package.
