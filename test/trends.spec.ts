import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics } from 'nestjs-metrics-core';
import {
  allTestDrivers,
  createOrdersDataSource,
  ordersQuery,
  resetOrders,
  seedOrders,
  TestDriver,
} from './helpers/orders-datasource';

describe.each(allTestDrivers())('trends() count by month on %s', (driver: TestDriver) => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    dataSource = await createOrdersDataSource(driver);
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('returns month-name labels and per-month counts', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-01-20 10:00:00` },
      { createdAt: `${year}-03-15 10:00:00` },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .trends();

    expect(result.labels).toContain('January');
    expect(result.labels).toContain('March');
    expect(result.labels).not.toContain('February');

    const data = result.data as number[];
    const jan = result.labels.indexOf('January');
    const mar = result.labels.indexOf('March');
    expect(data[jan]).toBe(2);
    expect(data[mar]).toBe(1);
  });

  it('returns empty labels and data when no rows match', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .trends();

    expect(result).toEqual({ labels: [], data: [] });
  });
});

describe('trends() count by hour on SQLite', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource?.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
  });

  it('returns hour labels and per-hour counts', async () => {
    // Use Date.UTC so the hour is deterministic regardless of host timezone.
    await seedOrders(dataSource, [
      { createdAt: new Date(Date.UTC(2026, 0, 10, 10, 0, 0)).toISOString() },
      { createdAt: new Date(Date.UTC(2026, 0, 10, 10, 30, 0)).toISOString() },
      { createdAt: new Date(Date.UTC(2026, 0, 10, 14, 0, 0)).toISOString() },
    ]);

    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byHour()
      .forYear(2026)
      .forMonth(1)
      .forDay(10)
      .trends();

    const labels = result.labels.map(String);
    expect(labels).toContain('10:00');
    expect(labels).toContain('14:00');

    const data = result.data as number[];
    const idx10 = labels.indexOf('10:00');
    const idx14 = labels.indexOf('14:00');
    expect(data[idx10]).toBe(2);
    expect(data[idx14]).toBe(1);
  });

  it('returns empty labels and data when no rows match', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byHour()
      .forYear(2026)
      .forMonth(1)
      .forDay(10)
      .trends();

    expect(result).toEqual({ labels: [], data: [] });
  });
});

describe('trends() label locale (SQLite)', () => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await resetOrders(dataSource);
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-02-10 10:00:00` },
    ]);
  });

  it('translates month labels in en (default)', async () => {
    const result = await Metrics.query(ordersQuery(dataSource))
      .count()
      .byMonth()
      .trends();

    expect(result.labels).toEqual(['January', 'February']);
  });

  it('translates month labels in pt-BR', async () => {
    const result = await Metrics.query(ordersQuery(dataSource), { locale: 'pt-BR' })
      .count()
      .byMonth()
      .trends();

    expect(result.labels).toEqual(['janeiro', 'fevereiro']);
  });
});
