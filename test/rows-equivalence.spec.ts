import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
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
});
