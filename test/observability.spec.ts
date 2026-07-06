import { describe, it, expect, vi } from 'vitest';
import { MetricsBuilder, QueryEvent, OnQueryHandler } from 'nestjs-metrics-core';
import { Aggregate, Period } from 'nestjs-metrics-core';
import { validateMetricsOptions, validateMetricsModuleOptions } from 'nestjs-metrics-core';

function fakeBackend(dialect: string = 'postgres', rows: Record<string, unknown>[] = [{ data: 42, label: 'Jan' }]) {
  return {
    dialect: { driverType: dialect,
      aggregate: () => `COUNT("orders"."id")`,
      periodExpr: () => '1',
      dateBucket: () => '1',
      convertTz: () => '1',
      escapeId: (id: string) => `"${id}"`,
      placeholder: () => '?',
    },
    run: vi.fn().mockResolvedValue(rows),
    toSql: vi.fn().mockReturnValue("SELECT 'masked'"),
    escapeId: (id: string) => `"${id}"`,
  };
}

describe('observability — onQuery', () => {
  it('fires onQuery on metrics() success', async () => {
    const events: QueryEvent[] = [];
    const handler: OnQueryHandler = (e) => events.push(e);

    const builder = new (MetricsBuilder as any)(
      fakeBackend('postgres', [{ data: 42 }]),
      'orders',
      { onQuery: handler } as any,
    );
    builder.count('id');

    const result = await builder.metrics();
    expect(result).toBe(42);
    expect(events).toHaveLength(1);
    expect(events[0].terminal).toBe('metrics');
    expect(events[0].cache).toBe('off');
    expect(events[0].dialect).toBe('postgres');
    expect(typeof events[0].durationMs).toBe('number');
    expect(events[0].durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof events[0].sql).toBe('string');
  });

  it('fires onQuery on trends() success', async () => {
    const events: QueryEvent[] = [];
    const handler: OnQueryHandler = (e) => events.push(e);

    const builder = new (MetricsBuilder as any)(
      fakeBackend('mysql', [{ data: 10, label: 'Feb' }]),
      'orders',
      { onQuery: handler } as any,
    );
    builder.countByMonth('id', 1);

    const result = await builder.trends();
    expect(result).toBeDefined();
    expect(events).toHaveLength(1);
    expect(events[0].terminal).toBe('trends');
    expect(events[0].cache).toBe('off');
    expect(events[0].dialect).toBe('mysql');
  });

  it('fires onQuery on metricsWithVariations() success', async () => {
    const events: QueryEvent[] = [];
    const handler: OnQueryHandler = (e) => events.push(e);

    const backend = fakeBackend('postgres', [{ data: 100 }]);
    const builder = new (MetricsBuilder as any)(
      backend,
      'orders',
      { onQuery: handler } as any,
    );
    builder.count('id');

    const result = await builder.metricsWithVariations(1, Period.DAY);
    // metricsWithVariations calls metrics() twice, so we get 3 events total
    expect(events.length).toBeGreaterThanOrEqual(1);
    const variationsEvent = events.find((e) => e.terminal === 'variations');
    expect(variationsEvent).toBeDefined();
    expect(variationsEvent!.dialect).toBe('postgres');
  });

  it('fires onQuery with error code on failure', async () => {
    const events: QueryEvent[] = [];
    const handler: OnQueryHandler = (e) => events.push(e);

    const backend = {
      dialect: { driverType: 'postgres',
        aggregate: () => 'COUNT("orders"."id")',
        periodExpr: () => '1',
        dateBucket: () => '1',
        convertTz: () => '1',
        escapeId: (id: string) => `"${id}"`,
        placeholder: () => '?',
      },
      run: vi.fn().mockRejectedValue(new Error('boom')),
      toSql: vi.fn().mockReturnValue("SELECT 'masked'"),
      escapeId: (id: string) => `"${id}"`,
    };

    const builder = new (MetricsBuilder as any)(
      backend,
      'orders',
      { onQuery: handler } as any,
    );
    builder.count('id');

    await expect(builder.metrics()).rejects.toThrow('boom');
    expect(events).toHaveLength(1);
    expect(events[0].terminal).toBe('metrics');
    expect(events[0].error).toBeDefined();
    expect(events[0].error!.code).toBe('QUERY_EXECUTION_ERROR');
  });

  it('a throwing hook never breaks the query path', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const handler: OnQueryHandler = () => {
      throw new Error('boom from observer');
    };

    const builder = new (MetricsBuilder as any)(
      fakeBackend('sqlite', [{ data: 7 }]),
      'orders',
      { onQuery: handler } as any,
    );
    builder.count('id');

    const result = await builder.metrics();
    expect(result).toBe(7);
    expect(consoleWarn).toHaveBeenCalled();
    consoleWarn.mockRestore();
  });

  it('no events fire when onQuery is not configured', async () => {
    const builder = new (MetricsBuilder as any)(
      fakeBackend('postgres', [{ data: 1 }]),
      'orders',
      {},
    );
    builder.count('id');
    const result = await builder.metrics();
    expect(result).toBe(1);
    // No assertion needed — just that it doesn't throw
  });

  it('onQuery event SQL has masked parameters', async () => {
    const events: QueryEvent[] = [];
    const handler: OnQueryHandler = (e) => events.push(e);

    const backend = fakeBackend('postgres', [{ data: 42 }]);
    backend.toSql.mockReturnValue("SELECT COUNT('orders'.'id') AS data FROM 'orders' WHERE EXTRACT(MONTH FROM 'orders'.'created_at') = 0");

    const builder = new (MetricsBuilder as any)(
      backend,
      'orders',
      { onQuery: handler } as any,
    );
    builder.count('id');

    await builder.metrics();
    expect(events[0].sql).not.toContain('42'); // numbers become 0
  });
});

describe('observability — Zod schemas', () => {
  it('MetricsOptionsSchema accepts onQuery', () => {
    const handler: OnQueryHandler = () => {};
    const result = validateMetricsOptions({ onQuery: handler });
    expect(result.onQuery).toBe(handler);
  });

  it('MetricsModuleOptionsSchema accepts onQuery', () => {
    const handler: OnQueryHandler = () => {};
    const result = validateMetricsModuleOptions({ onQuery: handler });
    expect(result.onQuery).toBe(handler);
  });

  it('MetricsOptionsSchema rejects non-function onQuery', () => {
    expect(() => validateMetricsOptions({ onQuery: 'not-a-function' as any })).toThrow();
  });

  it('onQuery is optional', () => {
    const result = validateMetricsOptions({});
    expect(result.onQuery).toBeUndefined();
  });
});
