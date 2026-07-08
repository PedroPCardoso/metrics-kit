import { MemoryCacheStore } from './memory-cache.store';
import type { CacheStore } from './types';

let instance: MemoryCacheStore | null = null;

export const defaultCacheStore: CacheStore = {
  get<T>(key: string): T | undefined {
    return getInstance().get<T>(key);
  },
  set<T>(key: string, value: T, ttl: number): void {
    getInstance().set(key, value, ttl);
  },
  del(key: string): void {
    getInstance().del(key);
  },
  clear(): void {
    getInstance().clear();
  },
  stats() {
    return getInstance().stats();
  },
};

function getInstance(): MemoryCacheStore {
  if (!instance) {
    instance = new MemoryCacheStore();
  }
  return instance;
}

export { MemoryCacheStore };
