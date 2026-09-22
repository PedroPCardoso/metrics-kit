import { describe, expect, it } from 'vitest';
import { MetricsBuilder } from '@core/metrics.builder';
import { Period } from '@core/enums/period.enum';
import { UnsupportedInRowsModeException } from '@core/exceptions/unsupported-in-rows-mode.exception';
import { ConfigurationError } from '@core/exceptions/configuration.exception';
import { MetricsError } from '@core/exceptions/metrics.error';

const rows = [
  { id: 1, created_at: '2026-01-10', amount: 100, status: 'paid', member_id: 1 },
  { id: 2, created_at: '2026-01-20', amount: 50, status: 'pending', member_id: 2 },
  { id: 3, created_at: '2026-02-05', amount: 200, status: 'paid', member_id: 1 },
  { id: 4, created_at: '2026-03-01', amount: 300, status: 'paid', member_id: 3 },
  { id: 5, created_at: '2026-05-11', amount: 150, status: 'paid', member_id: 1 },
];

const build = () => MetricsBuilder.fromRows(rows);

describe('MetricsBuilder.fromRows', () => {
  it('computes bare metrics', async () => {
    expect(await build().count().metrics()).toBe(5);
    expect(await build().sum('amount').metrics()).toBe(800);
    expect(await build().average('amount').metrics()).toBe(160);
  });

  it('computes monthly trends with gap fill (the flagship use case)', async () => {
    const result = await build()
      .sumByMonth('amount', 0)
      .forYear(2026)
      .fillMissingData()
      .trends();
    expect(result).toEqual({
      labels: ['January', 'February', 'March', 'April', 'May'],
      data: [150, 200, 300, 0, 150],
    });
  });

  it('scopes with the fluent where (gate pattern) end to end', async () => {
    const result = await build()
      .whereIn('member_id', [1])
      .sumByMonth('amount', 0)
      .forYear(2026)
      .trends();
    expect(result).toEqual({ labels: ['January', 'February', 'May'], data: [100, 200, 150] });
  });

  it('supports labelColumn, groupData and ranges', async () => {
    // Year-scoped categorical grouping: aggregate-shorthand .byYear(1) first via
    // countByYear, then .forYear(...), then .labelColumn(...) (see CLAUDE.md).
    const byStatus = await build()
      .countByYear('id', 1)
      .forYear(2026)
      .labelColumn('status')
      .trends();
    expect(byStatus).toEqual({ labels: ['paid', 'pending'], data: [4, 1] });

    const grouped = await build()
      .countBetween(['2026-01-01', '2026-03-31'], 'status')
      .groupByMonth()
      .groupData(['paid', 'pending'])
      .trends();
    expect(grouped).toEqual({
      labels: ['2026-01', '2026-02', '2026-03'],
      data: { total: [2, 1, 1], paid: [1, 1, 1], pending: [1, 0, 0] },
    });
  });

  it('supports metricsWithVariations', async () => {
    const result = await build()
      .sumByMonth('amount', 1)
      .forYear(2026)
      .forMonth(2)
      .metricsWithVariations(1, Period.MONTH);
    expect(result.count).toBe(200);
    expect(result.variation.type).toBe('increase');
  });

  it('respects a configured timezone at month boundaries (UTC−3)', async () => {
    const boundary = [{ created_at: '2026-03-01T01:00:00Z', amount: 10 }];
    const utc = await MetricsBuilder.fromRows(boundary)
      .sumByMonth('amount', 0).forYear(2026).trends();
    const sp = await MetricsBuilder.fromRows(boundary, {}, { timezone: 'America/Sao_Paulo' })
      .sumByMonth('amount', 0).forYear(2026).trends();
    expect(utc).toEqual({ labels: ['March'], data: [10] });
    expect(sp).toEqual({ labels: ['February'], data: [10] });
  });

  it('rejects SQL-only settings with a stable MetricsError code', () => {
    try {
      build().table('other');
      expect.unreachable('expected UnsupportedInRowsModeException');
    } catch (err) {
      expect(err).toBeInstanceOf(MetricsError);
      expect(err).toBeInstanceOf(UnsupportedInRowsModeException);
      expect((err as UnsupportedInRowsModeException).code).toBe('UNSUPPORTED_IN_ROWS_MODE');
    }
  });

  it('rejects caching: in-memory rows have no stable query identity', () => {
    expect(() => MetricsBuilder.fromRows(rows, {}, { cache: { enabled: true, ttl: 60 } })).toThrow(
      ConfigurationError,
    );
    // Disabled cache options are fine — only an enabled cache is a misconfiguration.
    expect(() =>
      MetricsBuilder.fromRows(rows, {}, { cache: { enabled: false, ttl: 60 } }),
    ).not.toThrow();
  });

  it('invalidate* are harmless no-ops in rows mode', async () => {
    await expect(build().count().invalidateMetrics()).resolves.toBeUndefined();
    await expect(build().countByMonth().invalidateTrends()).resolves.toBeUndefined();
  });
});
