import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import { GroupedTrendsResult, Metrics } from 'nestjs-metrics-core';
import {
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
} from './helpers/orders-datasource';

describe('cumulative() trends', () => {
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

  it('converts period trends to running totals', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-01-20 10:00:00` },
      { createdAt: `${year}-03-15 10:00:00` },
    ]);

    const result = (await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .cumulative()
      .trends()) as { labels: (string | number)[]; data: number[] };

    // January: 2 orders, March: should be 2 + 1 = 3
    const jan = result.labels.indexOf('January');
    const mar = result.labels.indexOf('March');
    expect(result.data[jan]).toBe(2);
    expect(result.data[mar]).toBe(3);
  });

  it('returns same data as non-cumulative when there is only one bucket', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
    ]);

    const cumulative = (await Metrics.query(ordersQuery(dataSource))
      .countByMonth().cumulative().trends());
    const normal = (await Metrics.query(ordersQuery(dataSource))
      .countByMonth().trends());

    expect((cumulative as { data: number[] }).data).toEqual((normal as { data: number[] }).data);
  });

  it('works with fillMissingData', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-03-15 10:00:00` },
    ]);

    const { data } = (await Metrics.query(ordersQuery(dataSource))
      .countByMonth()
      .fillMissingData()
      .cumulative()
      .trends()) as { labels: (string | number)[]; data: number[] };

    // Jan: 1, Feb (filled): 1, Mar: 2
    expect(data[0]).toBe(1);
    expect(data[1]).toBe(1);
    expect(data[2]).toBe(2);
  });

  it('works with groupData', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00`, status: 'paid' },
      { createdAt: `${year}-01-20 10:00:00`, status: 'pending' },
      { createdAt: `${year}-03-15 10:00:00`, status: 'paid' },
    ]);

    const result = (await Metrics.query(ordersQuery(dataSource))
      .countByMonth('status')
      .groupData(['paid', 'pending'])
      .cumulative()
      .trends()) as GroupedTrendsResult;

    // Month 1: paid=1, pending=1 → total=2
    // Month 3: paid=1, pending=0 → total=1
    // Cumulative: paid=[1, 2], pending=[1, 1], total=[2, 3]
    expect(result.data.total).toEqual([2, 3]);
    expect(result.data.paid).toEqual([1, 2]);
    expect(result.data.pending).toEqual([1, 1]);
  });
});

describe('cumulative() on executor backend', () => {
  it('produces running totals', async () => {
    const ds: DataSource = {
      dialect: 'sqlite',
      execute: async () => [
        { data: 5, label: 1 },
        { data: 3, label: 2 },
        { data: 7, label: 3 },
      ],
    };
    const result = await MetricsBuilder.queryExecutor(ds, { table: 'orders' })
      .countByMonth()
      .cumulative()
      .trends();

    expect(result.data).toEqual([5, 8, 15]);
  });
});
