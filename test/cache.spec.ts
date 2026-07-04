import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DataSource } from 'typeorm';
import { Metrics, MemoryCacheStore, Period, ValidationError } from 'nestjs-metrics-core';
import type { CacheStore, TrendsResult } from 'nestjs-metrics-core';
import { planCacheKey } from '@core/cache/cache-key';
import { defaultCacheStore } from '@core/cache/shared';
import type { QueryPlan } from '@core/backend/query-plan';
import {
  createOrdersDataSource,
  ordersQuery,
  seedOrders,
} from './helpers/orders-datasource';

describe('cache keys', () => {
  it('uses a versioned namespace prefix', () => {
    const plan: QueryPlan = {
      source: 'orders',
      select: [{ expr: 'COUNT("orders"."id")', alias: 'data' }],
      where: [],
      params: {},
    };

    expect(planCacheKey(plan)).toMatch(/^mk:v1:[a-f0-9]{32}$/);
  });
});

describe('cache — metrics()', () => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeEach(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterEach(async () => {
    defaultCacheStore.clear();
    await dataSource.destroy();
  });

  it('returns the cached value on a second identical query', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
    ]);

    const cache = new MemoryCacheStore();
    const opts = { cache: { enabled: true, ttl: 60 } };

    const first = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .count()
      .byMonth()
      .metrics();

    const second = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .count()
      .byMonth()
      .metrics();

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(cache.stats().hits).toBeGreaterThanOrEqual(1);
    cache.destroy();
  });

  it('does NOT cache when cache is disabled (default)', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
    ]);

    const builder = Metrics.query(ordersQuery(dataSource));
    const a = await builder.count().byMonth().metrics();
    const b = await builder.count().byMonth().metrics();

    expect(a).toBe(1);
    expect(b).toBe(1);
  });

  it('misses cache when the query plan differs', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-02-15 10:00:00` },
    ]);

    const cache = new MemoryCacheStore();
    const opts = { cache: { enabled: true, ttl: 60 } };

    const count = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .count()
      .byMonth()
      .metrics();

    const sum = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .sum('amount')
      .byMonth()
      .metrics();

    // Different aggregate plans produce different cache keys.
    expect(count).toBe(2);
    expect(sum).toBe(200);
    expect(cache.stats().hits).toBe(0);
    expect(cache.stats().misses).toBe(2);
    cache.destroy();
  });

  it('does not collide between executor tables that share the default store', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
    ]);
    await dataSource.query(`
      CREATE TABLE refunds (
        id integer primary key autoincrement,
        amount decimal(10, 2) default 0,
        created_at datetime
      )
    `);
    await dataSource.query(`
      INSERT INTO refunds (amount, created_at) VALUES
      (50, '${year}-01-11 10:00:00'),
      (75, '${year}-01-12 10:00:00')
    `);
    defaultCacheStore.clear();
    const opts = { cache: { enabled: true, ttl: 60 } };
    const executor = {
      dialect: 'sqlite' as const,
      execute: (sql: string, params: unknown[]) => dataSource.query(sql, params),
    };

    const ordersCount = await Metrics.queryExecutor(
      executor,
      { table: 'source', from: 'orders AS source' },
      opts,
    )
      .count()
      .metrics();
    const refundsCount = await Metrics.queryExecutor(
      executor,
      { table: 'source', from: 'refunds AS source' },
      opts,
    )
      .count()
      .metrics();

    expect(ordersCount).toBe(1);
    expect(refundsCount).toBe(2);
    expect(defaultCacheStore.stats().misses).toBe(2);
  });

  it('rejects negative TTL in public cache options', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
    ]);

    const store = new MemoryCacheStore();
    const opts = { cache: { enabled: true, ttl: -1 } }; // already expired

    expect(() => Metrics.query(ordersQuery(dataSource), opts, store)).toThrow(ValidationError);
    expect(store.stats().misses).toBe(0);
    store.destroy();
  });
});

describe('cache — trends()', () => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeEach(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('caches trend raw rows and re-applies formatting', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-02-15 10:00:00` },
    ]);

    const cache = new MemoryCacheStore();
    const opts = { cache: { enabled: true, ttl: 60 } };

    const first = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .countByMonth()
      .trends();

    const second = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .countByMonth()
      .trends();

    expect(first.labels).toEqual(second.labels);
    expect((first as TrendsResult).data).toEqual((second as TrendsResult).data);
    expect(cache.stats().hits).toBeGreaterThanOrEqual(1);
    cache.destroy();
  });

  it('cached trends still respect fillMissingData formatting', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
      { createdAt: `${year}-03-15 10:00:00` },
    ]);

    const cache = new MemoryCacheStore();
    const opts = { cache: { enabled: true, ttl: 60 } };

    const result = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .countByMonth()
      .fillMissingData()
      .trends() as TrendsResult;

    // Month 2 should be filled with 0.
    expect(result.data).toHaveLength(3);
    expect(result.data[1]).toBe(0);
    expect(cache.stats().misses).toBeGreaterThanOrEqual(1);
    cache.destroy();
  });
});

describe('cache — metricsWithVariations()', () => {
  let dataSource: DataSource;
  const year = new Date().getFullYear();

  beforeEach(async () => {
    dataSource = await createOrdersDataSource();
  });

  afterEach(async () => {
    await dataSource.destroy();
  });

  it('caches both current and previous queries independently', async () => {
    await seedOrders(dataSource, [
      { createdAt: `${year}-01-10 10:00:00` },
    ]);

    const cache = new MemoryCacheStore();
    const opts = { cache: { enabled: true, ttl: 60 } };

    const first = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .count()
      .byMonth()
      .metricsWithVariations(1, Period.MONTH);

    const second = await Metrics.query(ordersQuery(dataSource), opts, cache)
      .count()
      .byMonth()
      .metricsWithVariations(1, Period.MONTH);

    expect(first.count).toBe(second.count);
    expect(first.variation.type).toBe(second.variation.type);
    // Two sub-queries × two calls = at least 2 cache hits.
    expect(cache.stats().hits).toBeGreaterThanOrEqual(2);
    cache.destroy();
  });
});

describe('MemoryCacheStore', () => {
  it('get/set/del/stats lifecycle', () => {
    const store = new MemoryCacheStore();

    expect(store.get('a')).toBeUndefined();
    expect(store.stats().misses).toBe(1);

    store.set('a', 42, 60);
    expect(store.get('a')).toBe(42);
    expect(store.stats().hits).toBe(1);
    expect(store.stats().size).toBe(1);

    store.del('a');
    expect(store.get('a')).toBeUndefined();
    expect(store.stats().misses).toBe(2);

    store.clear();
    expect(store.stats().hits).toBe(0);
    expect(store.stats().misses).toBe(0);
    expect(store.stats().size).toBe(0);

    store.destroy();
  });

  it('evicts expired entries on get', () => {
    const store = new MemoryCacheStore();

    store.set('x', 'hello', -1); // already expired
    expect(store.get('x')).toBeUndefined();
    expect(store.stats().size).toBe(0);

    store.destroy();
  });

  it('destroy() cleans up the sweep timer and store', () => {
    const store = new MemoryCacheStore();
    store.set('k', 'v', 60);
    store.destroy();
    expect(store.get('k')).toBeUndefined();
  });
});

describe('cache — custom CacheStore', () => {
  it('accepts a pluggable CacheStore implementation', async () => {
    class SimpleStore implements CacheStore {
      private map = new Map<string, unknown>();
      private hits = 0;
      private misses = 0;

      get<T>(key: string): T | undefined {
        if (this.map.has(key)) { this.hits++; return this.map.get(key) as T; }
        this.misses++; return undefined;
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      set<T>(key: string, value: T, _ttl: number): void {
        this.map.set(key, value);
      }
      del(key: string): void { this.map.delete(key); }
      clear(): void { this.map.clear(); this.hits = 0; this.misses = 0; }
      stats() {
        return { hits: this.hits, misses: this.misses, size: this.map.size };
      }
    }

    const dataSource = await createOrdersDataSource();
    const year = new Date().getFullYear();
    await seedOrders(dataSource, [{ createdAt: `${year}-01-10 10:00:00` }]);

    const store = new SimpleStore();
    const opts = { cache: { enabled: true, ttl: 60 } };

    const first = await Metrics.query(ordersQuery(dataSource), opts, store)
      .count()
      .byMonth()
      .metrics();

    const second = await Metrics.query(ordersQuery(dataSource), opts, store)
      .count()
      .byMonth()
      .metrics();

    expect(first).toBe(1);
    expect(second).toBe(1);
    expect(store.stats().hits).toBe(1);

    await dataSource.destroy();
  });
});
