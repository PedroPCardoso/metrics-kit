import { createHash } from 'crypto';
import type { QueryPlan } from '../backend/query-plan';

function stableStringify(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'object') {
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Generate a deterministic cache key from a query plan. The key is a hex
 * digest of the plan shape so identical plans hit the same cache entry.
 */
export function planCacheKey(plan: QueryPlan, keyPrefix?: string): string {
  const payload = stableStringify({
    source: plan.source,
    select: plan.select,
    where: plan.where,
    groupBy: plan.groupBy,
    orderBy: plan.orderBy,
    distinct: plan.distinct,
    params: plan.params,
    tz: plan.tz,
  });
  const namespace = keyPrefix ? `${keyPrefix}:mk:v1` : 'mk:v1';
  return `${namespace}:${createHash('md5').update(payload).digest('hex')}`;
}
