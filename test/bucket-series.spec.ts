import { describe, expect, it } from 'vitest';
import { enumerateBuckets } from '@core/dates/bucket-series';

describe('enumerateBuckets()', () => {
  it('enumerates hourly buckets', () => {
    expect(enumerateBuckets('2026-01-01T10:15:00', '2026-01-01T12:30:00', 'hour')).toEqual([
      '2026-01-01 10:00',
      '2026-01-01 11:00',
      '2026-01-01 12:00',
    ]);
  });

  it('enumerates daily buckets', () => {
    expect(enumerateBuckets('2026-01-01', '2026-01-03', 'day')).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ]);
  });

  it('enumerates weekly buckets without duplicate labels', () => {
    expect(enumerateBuckets('2026-01-01', '2026-01-20', 'week')).toEqual([
      '2026-W01',
      '2026-W02',
      '2026-W03',
      '2026-W04',
    ]);
  });

  it('enumerates monthly buckets', () => {
    expect(enumerateBuckets('2026-01-15', '2026-03-20', 'month')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
    ]);
  });

  it('enumerates yearly buckets', () => {
    expect(enumerateBuckets('2024-06-01', '2026-01-01', 'year')).toEqual([
      '2024',
      '2025',
      '2026',
    ]);
  });
});
