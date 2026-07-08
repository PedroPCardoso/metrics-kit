import { describe, it, expect } from 'vitest';
import { toChartJs, toApexCharts, toRecharts } from 'nestjs-metrics-core/charts';
import type { TrendsResult, GroupedTrendsResult, TrendsComparisonResult } from 'nestjs-metrics-core';

const simple: TrendsResult = {
  labels: ['Jan', 'Feb', 'Mar'],
  data: [100, 200, 150],
};

const grouped: GroupedTrendsResult = {
  labels: ['Jan', 'Feb', 'Mar'],
  data: {
    total: [100, 250, 180],
    pending: [60, 150, 100],
    paid: [40, 100, 80],
  },
};

const comparison: TrendsComparisonResult = {
  labels: ['Jan', 'Feb', 'Mar'],
  current: [100, 200, 150],
  previous: [80, 150, 120],
};

const empty: TrendsResult = { labels: [], data: [] };

describe('toChartJs', () => {
  it('converts simple TrendsResult to line chart config', () => {
    const cfg = toChartJs(simple, { label: 'Revenue', type: 'line' });
    expect(cfg.type).toBe('line');
    expect(cfg.data.labels).toEqual(['Jan', 'Feb', 'Mar']);
    expect(cfg.data.datasets).toHaveLength(1);
    expect(cfg.data.datasets[0]).toEqual({ label: 'Revenue', data: [100, 200, 150] });
  });

  it('uses defaults when options omitted', () => {
    const cfg = toChartJs(simple);
    expect(cfg.type).toBe('line');
    expect(cfg.data.datasets[0].label).toBe('Value');
  });

  it('converts GroupedTrendsResult', () => {
    const cfg = toChartJs(grouped);
    expect(cfg.type).toBe('line');
    const datasetNames = cfg.data.datasets.map((d) => d.label);
    // total + 2 groups (order varies by Object.entries, but should include total)
    expect(datasetNames).toContain('Value (total)');
  });

  it('excludes total when includeTotal is false', () => {
    const cfg = toChartJs(grouped, { includeTotal: false });
    const datasetNames = cfg.data.datasets.map((d) => d.label);
    expect(datasetNames).not.toContain('Value (total)');
  });

  it('converts TrendsComparisonResult', () => {
    const cfg = toChartJs(comparison);
    expect(cfg.data.datasets).toHaveLength(2);
    expect(cfg.data.datasets[0]).toEqual({ label: 'Current', data: [100, 200, 150] });
    expect(cfg.data.datasets[1]).toEqual({ label: 'Previous', data: [80, 150, 120] });
  });

  it('handles empty series', () => {
    const cfg = toChartJs(empty);
    expect(cfg.data.labels).toEqual([]);
    expect(cfg.data.datasets).toHaveLength(1);
    expect(cfg.data.datasets[0].data).toEqual([]);
  });
});

describe('toApexCharts', () => {
  it('converts simple TrendsResult', () => {
    const cfg = toApexCharts(simple, { name: 'Revenue' });
    expect(cfg.series).toHaveLength(1);
    expect(cfg.series[0]).toEqual({ name: 'Revenue', data: [100, 200, 150] });
    expect(cfg.xaxis.categories).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('uses defaults', () => {
    const cfg = toApexCharts(simple);
    expect(cfg.series[0].name).toBe('Value');
  });

  it('converts GroupedTrendsResult', () => {
    const cfg = toApexCharts(grouped);
    expect(cfg.series.length).toBeGreaterThanOrEqual(2);
    expect(cfg.series[0].name).toBe('Value (total)');
  });

  it('converts TrendsComparisonResult', () => {
    const cfg = toApexCharts(comparison);
    expect(cfg.series).toHaveLength(2);
    expect(cfg.series[0]).toEqual({ name: 'Current', data: [100, 200, 150] });
    expect(cfg.series[1]).toEqual({ name: 'Previous', data: [80, 150, 120] });
  });

  it('handles empty series', () => {
    const cfg = toApexCharts(empty);
    expect(cfg.series).toHaveLength(1);
    expect(cfg.series[0].data).toEqual([]);
    expect(cfg.xaxis.categories).toEqual([]);
  });
});

describe('toRecharts', () => {
  it('converts simple TrendsResult to array of objects', () => {
    const data = toRecharts(simple);
    expect(data).toEqual([
      { label: 'Jan', value: 100 },
      { label: 'Feb', value: 200 },
      { label: 'Mar', value: 150 },
    ]);
  });

  it('converts GroupedTrendsResult', () => {
    const data = toRecharts(grouped);
    expect(data).toHaveLength(3);
    expect(data[0].label).toBe('Jan');
    expect((data[0] as any).total).toBe(100);
    expect((data[0] as any).pending).toBe(60);
    expect((data[0] as any).paid).toBe(40);
  });

  it('converts TrendsComparisonResult', () => {
    const data = toRecharts(comparison);
    expect(data).toHaveLength(3);
    expect(data[0]).toEqual({ label: 'Jan', current: 100, previous: 80 });
  });

  it('handles empty series', () => {
    const data = toRecharts(empty);
    expect(data).toEqual([]);
  });
});
