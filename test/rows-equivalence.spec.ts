import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import type { GroupedTrendsResult } from '@core/types';
import { createOrdersDataSource, resetOrders, seedOrders } from './helpers/orders-datasource';

const SEED = [
  { createdAt: '2026-01-10', amount: 100, status: 'paid' },
  { createdAt: '2026-01-31', amount: 50, status: 'pending' },
  { createdAt: '2026-02-01', amount: 200, status: 'paid' },
  { createdAt: '2026-02-15', amount: 75, status: 'refunded' },
  { createdAt: '2026-03-01', amount: 300, status: 'paid' },
  { createdAt: '2026-05-11', amount: 150, status: 'paid' },
];
// Same data as plain rows for fromRows (snake_case column, like the table).
// `id` mirrors the autoincrement primary key SQLite assigns each seeded row
// (1-based, insertion order) — count('id')/countByMonth('id', ...) rely on it
// being present, exactly as it is on the real `orders` table.
const ROWS = SEED.map(({ createdAt, ...rest }, index) => ({
  id: index + 1,
  created_at: createdAt,
  ...rest,
}));

describe('SQL backend and RowsBackend answer identically', () => {
  let typeorm: TypeOrmDataSource;
  let executor: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    executor = { dialect: 'sqlite', execute: (sql, params) => typeorm.query(sql, params) };
    await resetOrders(typeorm);
    await seedOrders(typeorm, SEED);
  });

  afterAll(async () => {
    await typeorm.destroy();
  });

  const sql = () => MetricsBuilder.queryExecutor(executor, { table: 'orders', dateColumn: 'created_at' });
  const mem = () => MetricsBuilder.fromRows(ROWS);

  type Chain = (b: ReturnType<typeof sql>) => ReturnType<typeof sql>;
  const same = async (chain: Chain, terminal: 'metrics' | 'trends' = 'trends') => {
    const [a, b] = await Promise.all([
      (chain(sql()) as any)[terminal](),
      (chain(mem() as any) as any)[terminal](),
    ]);
    expect(b).toEqual(a);
  };

  it('bare metrics', () => same((b) => b.sum('amount'), 'metrics'));
  it('monthly trends with gap fill', () =>
    same((b) => b.sumByMonth('amount', 0).forYear(2026).fillMissingData()));
  it('scoped trends via whereIn', () =>
    same((b) => b.whereIn('status', ['paid']).countByMonth('id', 0).forYear(2026)));
  it('range bucketing by week', () =>
    same((b) => b.countBetween(['2026-01-01', '2026-03-31']).groupByWeek().fillMissingData()));
  it('categorical labelColumn', () =>
    same((b) => b.count().byYear(1).forYear(2026).labelColumn('status')));
  it('grouped multi-series', () =>
    same((b) =>
      b.sumByMonth('amount', 0).forYear(2026).groupData(['paid', 'pending']).fillMissingData(),
    ));
  it('date-string range where filter', () =>
    same((b) => b.where('created_at', { gte: '2026-02-01' }).count(), 'metrics'));
  it('empty range where object matches every row', () =>
    same((b) => b.where('status', {}).count(), 'metrics'));
  it('countDistinct', () => same((b) => b.countDistinct('status'), 'metrics'));
  it('cumulative trends', () =>
    same((b) => b.sumByMonth('amount', 0).forYear(2026).cumulative().fillMissingData()));
  it('groupData auto-discovery (no explicit labels)', () =>
    same((b) => b.sumByMonth('amount', 0).forYear(2026).groupData().fillMissingData()));

  it('a whereIn scope excludes out-of-scope labels from groupData auto-discovery', async () => {
    const scoped = () =>
      sql().whereIn('status', ['paid', 'pending']).sumByMonth('amount', 0).forYear(2026).groupData();
    const scopedMem = () =>
      mem().whereIn('status', ['paid', 'pending']).sumByMonth('amount', 0).forYear(2026).groupData();
    const [a, b] = await Promise.all([scoped().trends(), scopedMem().trends()]);
    expect(b).toEqual(a);
    expect(Object.keys((a as GroupedTrendsResult).data)).not.toContain('refunded');
  });
});

describe('SQL backend and RowsBackend answer identically for hour-level bucketing', () => {
  // `SEED`/`ROWS` above use date-only `created_at` strings, which land at midnight
  // and would all fall in the same hour bucket — too weak to prove hour-level
  // bucketing. This uses its own isolated dataset (own DB + own in-memory rows) with
  // same-day, different-hour timestamps so it doesn't perturb any other test's
  // day/month/year-level expectations against the shared SEED fixture.
  const HOUR_SEED = [
    { createdAt: '2026-01-10 08:15:00', amount: 100, status: 'paid' },
    { createdAt: '2026-01-10 08:45:00', amount: 50, status: 'paid' },
    { createdAt: '2026-01-10 14:30:00', amount: 75, status: 'pending' },
  ];
  const HOUR_ROWS = HOUR_SEED.map(({ createdAt, ...rest }, index) => ({
    id: index + 1,
    created_at: createdAt,
    ...rest,
  }));

  let typeorm: TypeOrmDataSource;
  let executor: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    executor = { dialect: 'sqlite', execute: (sql, params) => typeorm.query(sql, params) };
    await resetOrders(typeorm);
    await seedOrders(typeorm, HOUR_SEED);
  });

  afterAll(async () => {
    await typeorm.destroy();
  });

  const sql = () => MetricsBuilder.queryExecutor(executor, { table: 'orders', dateColumn: 'created_at' });
  const mem = () => MetricsBuilder.fromRows(HOUR_ROWS);

  it('byHour bucketing across multiple hour buckets in the same day', async () => {
    // The range end must be a day boundary (`between()` only accepts YYYY-MM-DD),
    // so '2026-01-11' is used to enumerate every hour bucket of day 10 (hour-level
    // enumerateBuckets walks start..end inclusive at hour granularity — an end of
    // '2026-01-10' itself would enumerate only the single midnight bucket).
    const chain = (b: ReturnType<typeof sql>) =>
      b.countBetween(['2026-01-10', '2026-01-11'], 'id').groupByHour().fillMissingData();
    const [a, b] = await Promise.all([
      (chain(sql()) as any).trends(),
      (chain(mem() as any) as any).trends(),
    ]);
    expect(b).toEqual(a);
    // Prove this actually exercises multiple distinct hour buckets, not just one.
    const nonZeroBuckets = (a.data as number[]).filter((n: number) => n > 0).length;
    expect(nonZeroBuckets).toBeGreaterThanOrEqual(2);
  });
});
