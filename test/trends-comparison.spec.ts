import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import {
  InvalidPeriodException,
  InvalidVariationsCountException,
  Metrics,
  Period,
} from 'nestjs-metrics-core';
import type { TrendsComparisonResult } from 'nestjs-metrics-core';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

const year = new Date().getFullYear();

describe.each(allTestDrivers())('trendsWithComparison on %s', (driver: TestDriver) => {
  let dataSource: DataSource;

  const m = () => Metrics.query(ordersQuery(dataSource));

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('compares two trend series and merges on shared labels', async () => {
    // This year: Jan(2), Mar(1)
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-01-15 10:00:00` },
      { createdAt: `${year}-03-10 10:00:00` },
    ]);
    // Last year: Feb(2), Mar(1)
    await seedOrders(dataSource, [
      { createdAt: `${year - 1}-02-10 10:00:00` },
      { createdAt: `${year - 1}-02-15 10:00:00` },
      { createdAt: `${year - 1}-03-10 10:00:00` },
    ]);

    const r = await m()
      .countByMonth()
      .trendsWithComparison(1, Period.YEAR) as TrendsComparisonResult;

    expect(r.labels).toContain('January');
    expect(r.labels).toContain('February');
    expect(r.labels).toContain('March');

    const jan = r.labels.indexOf('January');
    const feb = r.labels.indexOf('February');
    const mar = r.labels.indexOf('March');

    expect(r.current[jan]).toBe(2);
    expect(r.current[feb]).toBe(0);
    expect(r.current[mar]).toBe(1);
    expect(r.previous[jan]).toBe(0);
    expect(r.previous[feb]).toBe(2);
    expect(r.previous[mar]).toBe(1);
  });

  it('returns empty series when no rows match in either window', async () => {
    const r = await m()
      .countByMonth()
      .trendsWithComparison(1, Period.YEAR) as TrendsComparisonResult;

    expect(r.labels).toEqual([]);
    expect(r.current).toEqual([]);
    expect(r.previous).toEqual([]);
  });

  it('handles inPercent conversion', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-01-15 10:00:00` },
    ]);
    await seedOrders(dataSource, [
      { createdAt: `${year - 1}-01-10 10:00:00` },
    ]);

    const r = await m()
      .countByMonth()
      .trendsWithComparison(1, Period.YEAR, true) as TrendsComparisonResult;

    expect(r.labels).toContain('January');
    expect(r.current).toEqual([100]);
    expect(r.previous).toEqual([100]);
  });
});

describe('trendsWithComparison validation', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('rejects a non-positive comparison count', async () => {
    await expect(
      Metrics.query(ordersQuery(dataSource)).countByMonth().trendsWithComparison(0, Period.YEAR),
    ).rejects.toThrow(InvalidVariationsCountException);
  });

  it('rejects an unsupported period', async () => {
    await expect(
      Metrics.query(ordersQuery(dataSource)).countByMonth().trendsWithComparison(1, Period.TODAY),
    ).rejects.toThrow(InvalidPeriodException);
  });
});
