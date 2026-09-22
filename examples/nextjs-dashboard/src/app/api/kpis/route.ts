import { NextResponse } from 'next/server';
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { orders, drizzleDb } from '../../../lib/db';

export async function GET(): Promise<NextResponse> {
  const totalOrders = await drizzleMetrics(drizzleDb, {
    table: orders,
    dateColumn: orders.createdAt,
  }).count().metrics();
  const totalRevenue = await drizzleMetrics(drizzleDb, {
    table: orders,
    dateColumn: orders.createdAt,
  }).sum('amount').metrics();
  return NextResponse.json({ totalOrders, totalRevenue });
}
