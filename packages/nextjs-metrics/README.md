# nextjs-metrics

Metrics & trends for **Prisma** and **Drizzle**, usable from Next.js Server
Components / Route Handlers or any Node runtime. The engine
([`nestjs-metrics-core`](../core)) plus ORM adapters, all from one import.

```bash
npm install nextjs-metrics
```

`@prisma/client` and `drizzle-orm` are **optional peers** — install only the one
you use (`drizzle-orm` is loaded lazily, so Prisma users never need it). The
terminals (`metrics()`, `trends()`) are **async**.

Each adapter lives under its own **isolated subpath** — `nextjs-metrics/prisma` and
`nextjs-metrics/drizzle` — so importing one never loads the other (these resolve under
both modern and classic `moduleResolution`). Both are also re-exported from the package
root (`nextjs-metrics`) for convenience.

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

Pass the typed table/column objects — the SQL names and **dialect** are inferred:

```ts
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { orders } from './schema';

await drizzleMetrics(db, { table: orders, dateColumn: orders.createdAt })
  .countByMonth().forYear(2026).trends();
```

Or strings with an explicit `dialect`:

```ts
await drizzleMetrics(db, { table: 'orders', dateColumn: 'created_at', dialect: 'sqlite' }).count().metrics();
```

Runs through the underlying driver Drizzle wraps (`db.$client`): `better-sqlite3`,
`node-postgres`, or `mysql2`.

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

## Notes

- **Timezone:** Postgres/MySQL get full timezone-aware bucketing; SQLite is
  UTC-only in the executor mode (a non-UTC timezone throws).
- **Safety:** identifiers are validated against an allowlist and quoted per
  dialect; all values bind as parameters.

The standalone engine (incl. `Metrics`/`metricsFor`) is also re-exported here, and
documented in [`nestjs-metrics-core`](../core).

## License

MIT
