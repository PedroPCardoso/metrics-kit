import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import { Metrics } from 'nestjs-metrics-core';
import {
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
} from './helpers/orders-datasource';

describe('countDistinct()', () => {
  let dataSource: TypeOrmDataSource;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('counts distinct values in a column', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00`, status: 'paid' },
      { createdAt: `${year}-01-11 10:00:00`, status: 'paid' },
      { createdAt: `${year}-01-12 10:00:00`, status: 'pending' },
      { createdAt: `${year}-01-13 10:00:00`, status: 'cancelled' },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .countDistinct('status')
      .metrics();

    // 3 distinct statuses: paid, pending, cancelled
    expect(result).toBe(3);
  });

  it('returns 0 when no rows match', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .countDistinct('status')
      .metrics();

    expect(result).toBe(0);
  });

  it('countDistinctByMonth trends works', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00`, status: 'paid' },
      { createdAt: `${year}-01-11 10:00:00`, status: 'paid' },
      { createdAt: `${year}-01-12 10:00:00`, status: 'pending' },
      { createdAt: `${year}-02-10 10:00:00`, status: 'refunded' },
      { createdAt: `${year}-02-11 10:00:00`, status: 'paid' },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .countDistinctByMonth('status')
      .forYear(year)
      .trends();

    // January: 2 distinct statuses (paid, pending)
    // February: 2 distinct statuses (refunded, paid)
    expect(result.labels).toContain('January');
    expect(result.labels).toContain('February');
  });

  it('countDistinctBetween works', async () => {
    await seedOrders(dataSource, [
      { createdAt: '2026-01-10 10:00:00', status: 'paid' },
      { createdAt: '2026-01-11 10:00:00', status: 'paid' },
      { createdAt: '2026-01-12 10:00:00', status: 'pending' },
      { createdAt: '2026-06-01 10:00:00', status: 'refunded' },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .countDistinctBetween(['2026-01-01', '2026-01-31'], 'status')
      .metrics();

    expect(result).toBe(2);
  });
});

describe('countDistinct() on executor backend', () => {
  it('emits COUNT(DISTINCT ...) SQL', async () => {
    let emittedSql = '';
    const ds: DataSource = {
      dialect: 'sqlite',
      execute: async (sql, _params) => {
        emittedSql = sql;
        return [];
      },
    };

    await MetricsBuilder.queryExecutor(ds, { table: 'orders' })
      .countDistinct('status')
      .metrics();

    expect(emittedSql).toContain('count(DISTINCT');
    expect(emittedSql).toContain('"status"');
  });
});
