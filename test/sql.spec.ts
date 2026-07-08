import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DataSource as TypeOrmDataSource } from 'typeorm';
import { MetricsBuilder } from '@core/metrics.builder';
import { DataSource } from '@core/datasource';
import { Metrics } from 'nestjs-metrics-core';
import {
  createOrdersDataSource,
  ordersQuery,
} from './helpers/orders-datasource';

describe('toSql() on executor backend', () => {
  it('returns a bare aggregate with no WHERE', () => {
    const ds: DataSource = {
      dialect: 'sqlite',
      execute: async () => [],
    };
    const sql = MetricsBuilder.queryExecutor(ds, { table: 'orders' })
      .count()
      .toSql();
    expect(sql).toBe('SELECT count("orders"."id") AS "data" FROM "orders"');
  });

  it('includes WHERE filters and inline param values', () => {
    const ds: DataSource = {
      dialect: 'sqlite',
      execute: async () => [],
    };
    const sql = MetricsBuilder.queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
      .sumByMonth('amount')
      .forYear(2026)
      .toSql();
    expect(sql).toContain('WHERE');
    expect(sql).toContain('= 2026');
  });

  it('mask=true redacts string params to [REDACTED] and numbers to 0', () => {
    const ds: DataSource = {
      dialect: 'sqlite',
      execute: async () => [],
    };
    const sql = MetricsBuilder.queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
      .sumByMonth('amount')
      .forYear(2026)
      .toSql({ mask: true });
    expect(sql).not.toContain("'2026'");
    // Numeric params become 0, string params become '[REDACTED]'
    expect(sql).toMatch(/=\s*0/);
  });

  it('toTrendsSql returns a grouped query', () => {
    const ds: DataSource = {
      dialect: 'sqlite',
      execute: async () => [],
    };
    const sql = MetricsBuilder.queryExecutor(ds, { table: 'orders', dateColumn: 'created_at' })
      .countByMonth()
      .forYear(2026)
      .toTrendsSql();
    expect(sql).toContain('GROUP BY label');
    expect(sql).toContain('ORDER BY label ASC');
  });
});

describe('toSql() on TypeORM backend', () => {
  let dataSource: TypeOrmDataSource;
  const year = new Date().getFullYear();

  beforeAll(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  it('returns SQL for a simple count', () => {
    const sql = Metrics.query(ordersQuery(dataSource)).count().byMonth().toSql();
    expect(sql).toContain('SELECT');
    expect(sql).toContain('count(');
    expect(sql).toContain('FROM');
  });

  it('toTrendsSql returns a grouped query', () => {
    const sql = Metrics.query(ordersQuery(dataSource))
      .countByMonth()
      .forYear(year)
      .toTrendsSql();
    expect(sql).toContain('GROUP BY');
    expect(sql).toContain('ORDER BY');
    expect(sql).toContain('label');
  });
});
