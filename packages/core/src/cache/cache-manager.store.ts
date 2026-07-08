import type { CacheStats, CacheStore } from './types';

/**
 * Minimal interface for the external cache client (e.g. cache-manager v5+).
 * The only requirement is `get(key)` (returns a value or undefined) and
 * `set(key, value, ttlMs)` (with TTL in milliseconds).
 */
export interface CacheManagerLike {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Wrap any cache-manager-compatible client (e.g. `cache-manager` v5 with Redis,
 * or a plain `cache-manager-redis-store`) so it satisfies the async
 * {@link CacheStore} contract.
 *
 * @param cache - A cache-manager-style client.
 * @returns An async {@link CacheStore} ready to drop into `MetricsModule.forRoot`.
 *
 * @example
 * ```ts
 * import { caching } from 'cache-manager';
 *
 * const cache = await caching('memory', { ttl: 60000 });
 * const store = createCacheManagerStore(cache);
 *
 * MetricsModule.forRoot({
 *   dataSource,
 *   cache: { enabled: true, ttl: 60 },
 *   cacheStore: store,
 * });
 * ```
 */
export function createCacheManagerStore(cache: CacheManagerLike): CacheStore {
  let hits = 0;
  let misses = 0;

  return {
    async get<T>(key: string): Promise<T | undefined> {
      const value = await cache.get<T>(key);
      if (value !== undefined && value !== null) {
        hits++;
        return value;
      }
      misses++;
      return undefined;
    },

    async set<T>(key: string, value: T, ttl: number): Promise<void> {
      await cache.set(key, value, ttl * 1000);
    },

    async del(key: string): Promise<void> {
      await cache.del(key);
    },

    async clear(): Promise<void> {
      await cache.clear();
      hits = 0;
      misses = 0;
    },

    stats(): CacheStats {
      return { hits, misses, size: -1 };
    },
  };
}
