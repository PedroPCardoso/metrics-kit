import { describe, it, expect, vi } from 'vitest';
import { MetricsBuilder } from 'nestjs-metrics-core';
import { MemoryCacheStore, createCacheManagerStore } from 'nestjs-metrics-core';
import type { CacheStore, CacheStats } from 'nestjs-metrics-core';

function fakeBackend(dialect = 'postgres', rows: Record<string, unknown>[] = [{ data: 42 }]) {
  return {
    dialect: {
      driverType: dialect,
      aggregate: () => `COUNT("orders"."id")`,
      periodExpr: () => '1',
      dateBucket: () => '1',
      convertTz: () => '1',
      escapeId: (id: string) => `"${id}"`,
      placeholder: () => '?',
    },
    run: vi.fn().mockResolvedValue(rows),
    escapeId: (id: string) => `"${id}"`,
  };
}

describe('async CacheStore contract', () => {
  it('MemoryCacheStore preserves sync methods', () => {
    const store = new MemoryCacheStore();
    store.set('k1', 42, 60);
    expect(store.get('k1')).toBe(42);
    expect(store.get('k2')).toBeUndefined();
  });

  it('satisfies the widened CacheStore interface', () => {
    const store: CacheStore = new MemoryCacheStore();
    store.set('k', 'hello', 60);
    const val = store.get<string>('k');
    expect(val).toBe('hello');
  });

  it('builder withCache awaits sync store (MemoryCacheStore)', async () => {
    const builder = new (MetricsBuilder as any)(
      fakeBackend('sqlite', [{ data: 99 }]),
      'orders',
      { cache: { enabled: true, ttl: 60 } },
    );
    builder.count('id');

    const result = await builder.metrics();
    expect(result).toBe(99);
  });

  it('builder withCache handles async store (cache-manager bridge)', async () => {
    const asyncStore: CacheStore = {
      async get<T>(key: string): Promise<T | undefined> {
        if (key.includes('mk:v1')) return [{ data: 77 }] as unknown as T;
        return undefined;
      },
      async set<T>(_key: string, _value: T, _ttl: number): Promise<void> {},
      async del(_key: string): Promise<void> {},
      async clear(): Promise<void> {},
      stats(): CacheStats {
        return { hits: 0, misses: 0, size: 0 };
      },
    };

    const builder = new (MetricsBuilder as any)(
      fakeBackend('postgres', [{ data: 1 }]),
      'orders',
      { cache: { enabled: true, ttl: 60 } },
      asyncStore,
    );
    builder.count('id');

    const result = await builder.metrics();
    expect(result).toBe(77); // cached value returned
  });

  it('async store miss falls through to execution', async () => {
    let setCalled = false;
    const asyncStore: CacheStore = {
      async get<T>(_key: string): Promise<T | undefined> {
        return undefined;
      },
      async set<T>(_key: string, _value: T, _ttl: number): Promise<void> {
        setCalled = true;
      },
      async del(_key: string): Promise<void> {},
      async clear(): Promise<void> {},
      stats(): CacheStats {
        return { hits: 0, misses: 0, size: 0 };
      },
    };

    const builder = new (MetricsBuilder as any)(
      fakeBackend('postgres', [{ data: 55 }]),
      'orders',
      { cache: { enabled: true, ttl: 60 } },
      asyncStore,
    );
    builder.count('id');

    const result = await builder.metrics();
    expect(result).toBe(55);
    expect(setCalled).toBe(true);
  });

  it('invalidateCache awaits async del', async () => {
    let deletedKey = '';
    const asyncStore: CacheStore = {
      async get<T>(_key: string): Promise<T | undefined> {
        return undefined;
      },
      async set<T>(_key: string, _value: T, _ttl: number): Promise<void> {},
      async del(key: string): Promise<void> {
        deletedKey = key;
      },
      async clear(): Promise<void> {},
      stats(): CacheStats {
        return { hits: 0, misses: 0, size: 0 };
      },
    };

    const builder = new (MetricsBuilder as any)(
      fakeBackend('postgres', [{ data: 1 }]),
      'orders',
      { cache: { enabled: true, ttl: 60 } },
      asyncStore,
    );
    builder.count('id');

    await builder.invalidateMetrics();
    expect(deletedKey).toBeTruthy();
    expect(deletedKey).toContain('mk:v1');
  });
});

describe('createCacheManagerStore', () => {
  it('wraps a cache-manager-like client', async () => {
    const map = new Map<string, unknown>();
    const fakeCache = {
      async get<T>(key: string): Promise<T | undefined> {
        return map.get(key) as T | undefined;
      },
      async set(key: string, value: unknown, _ttlMs?: number): Promise<void> {
        map.set(key, value);
      },
      async del(key: string): Promise<void> {
        map.delete(key);
      },
      async clear(): Promise<void> {
        map.clear();
      },
    };

    const store = createCacheManagerStore(fakeCache);

    await store.set('test', { count: 1 }, 60);
    const val = await store.get<{ count: number }>('test');
    expect(val).toEqual({ count: 1 });

    await store.del('test');
    expect(await store.get('test')).toBeUndefined();
  });

  it('reports hits and misses', async () => {
    const map = new Map<string, unknown>();
    const fakeCache = {
      async get<T>(key: string): Promise<T | undefined> {
        return map.get(key) as T | undefined;
      },
      async set(key: string, value: unknown, _ttlMs?: number): Promise<void> {
        map.set(key, value);
      },
      async del(key: string): Promise<void> {
        map.delete(key);
      },
      async clear(): Promise<void> {
        map.clear();
      },
    };

    const store = createCacheManagerStore(fakeCache);
    await store.set('a', 1, 60);

    await store.get('a'); // hit
    await store.get('b'); // miss

    const stats = store.stats() as CacheStats;
    expect(stats.hits).toBe(1);
    expect(stats.misses).toBe(1);
  });

  it('clears hit/miss counters', async () => {
    const map = new Map<string, unknown>();
    const fakeCache = {
      async get<T>(key: string): Promise<T | undefined> {
        return map.get(key) as T | undefined;
      },
      async set(key: string, value: unknown, _ttlMs?: number): Promise<void> {
        map.set(key, value);
      },
      async del(key: string): Promise<void> {
        map.delete(key);
      },
      async clear(): Promise<void> {
        map.clear();
      },
    };

    const store = createCacheManagerStore(fakeCache);
    await store.set('a', 1, 60);
    await store.get('a');
    await store.clear();

    const stats = store.stats() as CacheStats;
    expect(stats.hits).toBe(0);
    expect(stats.misses).toBe(0);
  });
});
