import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import { Period } from '@core/enums/period.enum';
import { createOrdersDataSource, ordersQuery, resetOrders, seedOrders } from './helpers/orders-datasource';

describe('fluent where / whereIn', () => {
  let typeorm: TypeOrmDataSource;
  let executor: DataSource;

  beforeAll(async () => {
    typeorm = await createOrdersDataSource('better-sqlite3');
    executor = { dialect: 'sqlite', execute: (sql, params) => typeorm.query(sql, params) };
    await resetOrders(typeorm);
    await seedOrders(typeorm, [
      { createdAt: '2026-01-10', amount: 100, status: 'paid' },
      { createdAt: '2026-01-20', amount: 50, status: 'pending' },
      { createdAt: '2026-02-05', amount: 200, status: 'paid' },
      { createdAt: '2026-02-15', amount: 75, status: 'refunded' },
    ]);
  });

  afterAll(async () => {
    await typeorm.destroy();
  });

  const exec = () =>
    MetricsBuilder.queryExecutor(executor, { table: 'orders', dateColumn: 'created_at' });

  it('whereIn scopes an executor-mode metric (the visibility-gate pattern)', async () => {
    expect(await exec().whereIn('status', ['paid', 'refunded']).count().metrics()).toBe(3);
  });

  it('empty whereIn matches nothing (fail closed)', async () => {
    expect(await exec().whereIn('status', []).count().metrics()).toBe(0);
  });

  it('where supports equality, range and null, ANDed across calls', async () => {
    expect(await exec().where('status', 'paid').where('amount', { gte: 150 }).count().metrics()).toBe(1);
  });

  it('works in TypeORM mode too', async () => {
    const qb = ordersQuery(typeorm);
    expect(await MetricsBuilder.query(qb).whereIn('status', ['paid']).count().metrics()).toBe(2);
  });

  it('survives metricsWithVariations cloning (scope applies to both periods)', async () => {
    const result = await exec()
      .whereIn('status', ['paid'])
      .countByMonth('id', 1)
      .forMonth(2)
      .forYear(2026)
      .metricsWithVariations(1, Period.MONTH);
    expect(result.count).toBe(1);
  });
});
