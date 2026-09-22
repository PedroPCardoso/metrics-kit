# Next.js + Prisma example

Chart-ready metrics from a Prisma client using `nextjs-metrics/prisma`.

## Install

```bash
npm install nextjs-metrics @prisma/client
```

## Query in a Route Handler

```ts
// app/api/metrics/revenue/route.ts
import { NextResponse } from 'next/server';
import { prismaMetrics } from 'nextjs-metrics/prisma';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const trends = await prismaMetrics(prisma, {
    table: 'orders',
    dateColumn: 'created_at',
    dialect: 'postgres',
    where: { status: 'paid' },
  })
    .sumByMonth('amount', 12)
    .forYear(2026)
    .fillMissingData()
    .trends();

  return NextResponse.json(trends);
}
```

## Query in a Server Component

```tsx
// app/dashboard/page.tsx
import { prismaMetrics } from 'nextjs-metrics/prisma';
import { prisma } from '@/lib/prisma';
import { RevenueChart } from './RevenueChart';

export default async function DashboardPage() {
  const data = await prismaMetrics(prisma, {
    table: 'orders',
    dateColumn: 'created_at',
    dialect: 'postgres',
  })
    .sumByMonth('amount', 6)
    .fillMissingData()
    .trends();

  return <RevenueChart data={data} />;
}
```

## Expected output

```json
{
  "labels": ["January", "February", "March", "April", "May", "June"],
  "data": [1200, 950, 1100, 1300, 1250, 1400]
}
```

## Notes

- Prisma cannot report its database provider at runtime, so `dialect` is required.
- `where` supports equality, `IN`, ranges and `IS NULL`.

## Next steps

- Read the [`nextjs-metrics` README](../../packages/nextjs-metrics/README.md).
- Read the full API reference in [`packages/core`](../../packages/core/README.md).
