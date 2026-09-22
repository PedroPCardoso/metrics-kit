import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';
import { PeriodResolver } from '@core/dates/period-resolver';

/**
 * Pure unit tests for the window-bound math, with `now` injected so the
 * results are deterministic regardless of when the suite runs. This covers the
 * intricate day/week/month "last N" clamping that the integration tests only
 * exercise partially.
 */
describe('PeriodResolver window bounds', () => {
  describe('monthPeriod', () => {
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 23 });

    it('returns [ref-n .. ref] when the window fits in the year', () => {
      const r = new PeriodResolver({ year: 2026, month: 6, day: 15, week: 25, hour: 0 }, 3, now);
      expect(r.monthPeriod()).toEqual([3, 6]);
    });

    it('clamps to the start of the year when the window is larger', () => {
      const r = new PeriodResolver({ year: 2026, month: 2, day: 15, week: 7, hour: 0 }, 5, now);
      expect(r.monthPeriod()).toEqual([1, 2]);
    });

    it('uses the end of the year for a past reference year', () => {
      // Upper bound = end of the past year (month 12); lower bound is the
      // reference month (4) minus the window (3) → month 1, faithful to the
      // original (carbon()->subMonths uses the reference month, not the clamp).
      const r = new PeriodResolver({ year: 2024, month: 4, day: 15, week: 16, hour: 0 }, 3, now);
      expect(r.monthPeriod()).toEqual([1, 12]);
    });
  });

  describe('dayPeriod', () => {
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 23 });

    it('returns [day-n .. day] when the window fits in the month', () => {
      const r = new PeriodResolver({ year: 2026, month: 6, day: 15, week: 25, hour: 0 }, 3, now);
      expect(r.dayPeriod()).toEqual([12, 15]);
    });

    it('clamps to the first of the month when the window is larger', () => {
      const r = new PeriodResolver({ year: 2026, month: 6, day: 2, week: 23, hour: 0 }, 5, now);
      expect(r.dayPeriod()).toEqual([1, 2]);
    });
  });

  describe('weekPeriod', () => {
    const now = DateTime.fromObject({ year: 2026, month: 3, day: 23 });

    it('returns [week-n .. week] when the window fits in the month', () => {
      // March 2026: Mar 1 = ISO week 9, Mar 2 = week 10, Mar 9 = week 11.
      const r = new PeriodResolver({ year: 2026, month: 3, day: 9, week: 11, hour: 0 }, 1, now);
      expect(r.weekPeriod()).toEqual([10, 11]);
    });

    it('clamps to the first week of the month when the window is larger', () => {
      const r = new PeriodResolver({ year: 2026, month: 3, day: 1, week: 9, hour: 0 }, 5, now);
      expect(r.weekPeriod()).toEqual([9, 9]);
    });
  });

  describe('hourPeriod', () => {
    const now = DateTime.fromObject({ year: 2026, month: 6, day: 23 });

    it('returns [hour-n .. hour] when the window fits in the day', () => {
      const r = new PeriodResolver({ year: 2026, month: 6, day: 23, week: 26, hour: 14 }, 3, now);
      expect(r.hourPeriod()).toEqual([11, 14]);
    });

    it('clamps to hour 0 when the window is larger than the current hour', () => {
      const r = new PeriodResolver({ year: 2026, month: 6, day: 23, week: 26, hour: 2 }, 5, now);
      expect(r.hourPeriod()).toEqual([0, 2]);
    });

    it('uses hour 23 for a past reference day', () => {
      const r = new PeriodResolver({ year: 2026, month: 6, day: 15, week: 25, hour: 10 }, 3, now);
      expect(r.hourPeriod()).toEqual([20, 23]);
    });
  });
});
