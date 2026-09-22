# Next.js + Drizzle example

Chart-ready metrics from a Drizzle client using `nextjs-metrics/drizzle`.

## Install

```bash
npm install nextjs-metrics drizzle-orm
```

## Query in a Route Handler

```ts
// app/api/metrics/revenue/route.ts
import { NextResponse } from 'next/server';
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { db } from '@/lib/db';
import { orders } from '@/schema';

export async function GET() {
  const trends = await drizzleMetrics(db, {
    table: orders,
    dateColumn: orders.createdAt,
  })
    .sumByMonth('amount', 12)
    .forYear(2026)
    .fillMissingData()
    .trends();

  return NextResponse.json(trends);
}
```

## Query with string table names

If you prefer strings, pass the dialect explicitly:

```ts
import { drizzleMetrics } from 'nextjs-metrics/drizzle';

const trends = await drizzleMetrics(db, {
  table: 'orders',
  dateColumn: 'created_at',
  dialect: 'sqlite',
})
  .countByMonth()
  .forYear(2026)
  .trends();
```

## Expected output

```json
{
  "labels": ["January", "February", "March", "April", "May", "June"],
  "data": [1200, 950, 1100, 1300, 1250, 1400]
}
```

## Notes

- Passing typed Drizzle table/column objects infers the dialect and SQL names automatically.
- `nextjs-metrics/drizzle` is lazily loaded, so it never pulls in Prisma code.

## Next steps

- Read the [`nextjs-metrics` README](../../packages/nextjs-metrics/README.md).
- Read the full API reference in [`packages/core`](../../packages/core/README.md).
