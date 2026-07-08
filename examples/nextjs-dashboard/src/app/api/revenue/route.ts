import { NextResponse } from 'next/server';
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { toChartJs } from 'nestjs-metrics-core/charts';
import { orders, drizzleDb } from '../../../lib/db';

export async function GET(): Promise<NextResponse> {
  const result = await drizzleMetrics(drizzleDb, {
    table: orders,
    dateColumn: orders.createdAt,
  })
    .sumByMonth('amount')
    .forYear(new Date().getFullYear())
    .trends();
  return NextResponse.json(toChartJs(result, { label: 'Revenue' }));
}
