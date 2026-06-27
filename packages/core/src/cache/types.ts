/** Per-call cache configuration. Caching is opt-in and transparent. */
export interface CacheOptions {
  enabled: boolean;
  ttl: number; // seconds
}

/** An entry stored in the cache with an absolute expiration timestamp. */
export interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** Hit/miss counters and current size. */
export interface CacheStats {
  hits: number;
  misses: number;
  size: number;
}

/** Pluggable cache backend. The default MemoryCacheStore is suitable for single-process use. */
export interface CacheStore {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl: number): void;
  del(key: string): void;
  clear(): void;
  stats(): CacheStats;
}
