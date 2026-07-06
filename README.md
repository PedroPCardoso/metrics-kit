# Metrics Kit

[![CI](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/nestjs-metrics)](https://www.npmjs.com/package/nestjs-metrics)
[![npm downloads](https://img.shields.io/npm/dm/nestjs-metrics)](https://www.npmjs.com/package/nestjs-metrics)
[![license](https://img.shields.io/npm/l/nestjs-metrics)](./LICENSE)
[![types](https://img.shields.io/npm/types/nestjs-metrics)](https://www.npmjs.com/package/nestjs-metrics)

Generate **chart-ready metrics** and **trends** from your database through a single,
fluent TypeScript API — a port of [`eliseekn/laravel-metrics`](https://github.com/eliseekn/laravel-metrics)
for NestJS, Next.js and any Node runtime.

One shared **ORM-agnostic engine**, with adapters per stack. The same fluent API
runs over **TypeORM**, **Prisma** or **Drizzle**, and produces identical,
chart-friendly payloads across **PostgreSQL**, **MySQL/MariaDB** and **SQLite**.

```ts
// NestJS + TypeORM
this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sumByMonth('amount', 12)
  .fillMissingData()
  .trends();
// → { labels: ['January', ...], data: [1200, ...] }
```

## Why Metrics Kit?

- **One API, many stacks** — use the same builder in NestJS, Next.js or standalone Node.
- **Database portability** — switch between Postgres, MySQL and SQLite without rewriting queries.
- **Locale & timezone aware** — month/day labels translated, with DST-correct bucketing.
- **Chart-ready output** — `trends()` returns `{ labels, data }` directly usable by Chart.js, Recharts, ApexCharts, etc.
- **Built-in helpers** — `fillMissingData`, `groupData` for stacked series, `metricsWithVariations`, percentage trends.
- **Production hardened** — typed errors, identifier validation, SQL injection guards, optional query caching and CI-tested against real databases.

## Packages

| Package | What it is | Install |
| --- | --- | --- |
| [`nestjs-metrics-core`](packages/core) | The engine + fluent API. Dual-mode: TypeORM query builder or raw-SQL executor. | `npm i nestjs-metrics-core` |
| [`nestjs-metrics`](packages/nestjs-metrics) | The engine + a NestJS module (`/nestjs`). | `npm i nestjs-metrics` |
| [`nextjs-metrics`](packages/nextjs-metrics) | The engine + Prisma & Drizzle adapters for Next.js / any Node runtime. | `npm i nextjs-metrics` |
| [`@nestjs-metrics/cli`](packages/cli) | Generators, scaffolds, validation and a local playground. | `npx @nestjs-metrics/cli` |

All public packages ship **dual CJS/ESM** builds with TypeScript declarations.
`nestjs-metrics` and `nextjs-metrics` depend on `nestjs-metrics-core` — one engine,
two framework-flavoured packages. The terminals (`metrics()`, `trends()`,
`metricsWithVariations()`) are **async**.

Physical subpath stubs such as `nestjs-metrics/nestjs` and
`nextjs-metrics/prisma` are published so classic TypeScript
`moduleResolution: "node"` continues to resolve subpaths.

## Quick start

### NestJS / TypeORM — `nestjs-metrics`

```bash
npm install nestjs-metrics typeorm
```

```ts
import { Module } from '@nestjs/common';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';

@Module({
  imports: [MetricsModule.forRoot({ locale: 'pt-BR', timezone: 'America/Sao_Paulo' })],
})
export class AppModule {}

// inside a provider:
const revenue = await this.metrics
  .query(orderRepo.createQueryBuilder('orders'))
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

### Prisma — `nextjs-metrics`

```bash
npm install nextjs-metrics @prisma/client
```

```ts
import { prismaMetrics } from 'nextjs-metrics/prisma';

await prismaMetrics(prisma, { table: 'orders', dateColumn: 'created_at', dialect: 'postgres' })
  .sumByMonth('amount')
  .forYear(2026)
  .fillMissingData()
  .trends();
```

### Drizzle — `nextjs-metrics`

```bash
npm install nextjs-metrics drizzle-orm
```

```ts
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { orders } from './schema';

await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt })
  .countByMonth()
  .forYear(2026)
  .trends();
```

### Standalone engine — `nestjs-metrics-core`

```bash
npm install nestjs-metrics-core
```

```ts
import { Metrics, type DataSource } from 'nestjs-metrics-core';

// TypeORM query builder
await Metrics.query(orderRepo.createQueryBuilder('orders')).count().metrics();

// or any driver via the executor mode
const dataSource: DataSource = {
  dialect: 'postgres',
  execute: (sql, params) => pool.query(sql, params).then((r) => r.rows),
};

await Metrics.queryExecutor(dataSource, { table: 'orders', dateColumn: 'created_at' })
  .sumByMonth('amount')
  .trends();
```

See each package's README for the full API, the [`examples/`](./examples) folder
for copy-paste snippets, and [`docs/GUIA-NESTJS.md`](./docs/GUIA-NESTJS.md) for a
comprehensive Portuguese walkthrough.

## Comparison

| Capability | Metrics Kit | Raw SQL | TypeORM QueryBuilder / Prisma aggregate | `laravel-metrics` |
|---|---|---|---|---|
| Fluent, chainable API | Yes | No | Partial | Yes |
| NestJS module | Yes | No | No | No |
| Next.js / Prisma / Drizzle | Yes | Yes* | Partial | No |
| Multi-dialect (Postgres/MySQL/SQLite) out of the box | Yes | No | No | Yes (PHP) |
| Locale/timezone-aware bucketing | Yes | Manual | Manual | Yes |
| `fillMissingData` / `groupData` / variations | Yes | Manual | Manual | Yes |
| Typed errors & identifier validation | Yes | No | Partial | Partial |

\* Raw SQL is always possible but requires you to write, maintain and secure it yourself.

**When to use Metrics Kit:** you want a portable, testable, chart-ready metrics DSL
that works across ORMs and databases without hand-writing date-bucketing SQL.

**When to use something else:** you only need a single one-off aggregation on a
single database, or you are already happy with ORM-native aggregates and do not
need locale/timezone helpers.

## Production checklist

- Set default `locale` and `timezone` in `MetricsModule.forRoot` or per query.
- Use `fillMissingData()` when rendering charts so missing buckets do not collapse.
- Prefer `groupData()` for stacked charts instead of running many separate queries.
- Avoid high-cardinality values in `labelColumn` (do not use raw user IDs, emails or dynamic URLs).
- Enable query caching (Redis `CacheStore`) for hot dashboard endpoints.
- Run integration tests against your target dialect — date/time SQL differs across drivers.

## Caching

Caching is opt-in per query or adapter default. The default store is in-memory;
custom stores implement the `CacheStore` interface, which is the extension point
for Redis or other backends.

```typescript
const cache = new MemoryCacheStore();
const events: CacheEvent[] = [];

const builder = Metrics.query(qb, {
  cache: {
    enabled: true,
    ttl: 60,
    keyPrefix: 'tenant-a',
    logger: (event) => events.push(event), // hit, miss, set, delete
  },
}, cache);

await builder.count().metrics();
await builder.invalidateMetrics(); // bust this metric query
```

Cache keys include the source table/FROM identity and the built-in `mk:v1`
namespace. Custom `keyPrefix` values are prepended before that namespace; older
in-memory keys intentionally miss after the `mk:v1` cache-key format change.

## Identifier safety

Executor specs are validated with Zod for clearer upfront errors, but SQL
identifier injection is blocked by the builder choke point:
`assertSafeIdentifier` plus `qualify`. Do not relax that guard because named SQL
parameters protect values, not table or column identifiers.

## Error codes

All typed errors expose a stable `code`; see
[docs/ERROR_CODES.md](./docs/ERROR_CODES.md) for the full reference table.
Serialized errors redact bound SQL `params` by default, while raw params remain
available in-process through `error.context?.params` for trusted debugging.

## CLI and playground

The optional CLI package provides deterministic code generation and a local
playground:

```bash
npx @nestjs-metrics/cli generate service --name OrderMetrics --entity Order
npx @nestjs-metrics/cli generate dashboard --name Admin --metrics orders,users,revenue
npx @nestjs-metrics/cli scaffold ecommerce
npx @nestjs-metrics/cli scaffold saas
npx @nestjs-metrics/cli scaffold basic
npx @nestjs-metrics/cli validate
npx @nestjs-metrics/cli playground
```

`metrics playground` starts a local HTTP server with sample data, visual controls,
live preview and generated code. It is intentionally offline and uses sample
datasets only; it does not connect to your database.

## API reference

Every public API — the fluent `MetricsBuilder`, the repository helpers, the
executor types, the NestJS module and the Prisma/Drizzle adapters — ships JSDoc
with usage examples, so your editor surfaces it inline. Generate the full HTML
reference with [TypeDoc](https://typedoc.org):

```bash
docker compose run --rm dev npm run docs:api   # writes docs/api/
```

Full API reference is also available on the
[NestJ ReadMe](https://nestjs-metrics.readme.io/docs/getting-started) site.

## Development

npm-workspaces monorepo. Everything runs in Docker:

```bash
docker compose run --rm dev npm install
docker compose run --rm dev npm run typecheck
docker compose run --rm dev npm test            # SQLite
docker compose run --rm dev npm run test:coverage
docker compose up -d --wait postgres mysql
bash scripts/load-mysql-tz.sh                    # MySQL named timezones (for tz tests)
docker compose run --rm -e PG_HOST=postgres -e MYSQL_HOST=mysql dev npm test
docker compose run --rm dev npm run build        # builds all packages
```

Build, test, lint, typecheck, API docs and smoke commands are orchestrated by
Turborepo. Package builds are cached with `dist/**` outputs; GitHub Actions
restores `.turbo/cache`, and remote Turbo caching can be enabled by configuring
`TURBO_TOKEN` and `TURBO_TEAM` for the repository.

Coverage is enforced in CI with global thresholds of 90% statements, 85%
branches, 80% functions, and 90% lines. Local reports are written to
`coverage/`.

Releases use Changesets — see [docs/RELEASING.md](./docs/RELEASING.md).

## License

MIT
