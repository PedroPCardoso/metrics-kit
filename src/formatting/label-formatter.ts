import { DateTime, Info } from 'luxon';
import { Period } from '../enums/period.enum';

export interface LabelContext {
  year: number;
  month: number;
}

/**
 * Translates the raw period bucket that comes back from SQL (a month number,
 * day-of-month, ISO week number, or year) into a human-readable, locale-aware
 * label for charts.
 */
export class LabelFormatter {
  constructor(private readonly locale: string) {}

  format(rawLabel: unknown, period: Period | null, ctx: LabelContext): string | number {
    switch (period) {
      case Period.MONTH:
        return this.monthName(Number(rawLabel));
      case Period.DAY:
        return this.weekdayName(ctx.year, ctx.month, Number(rawLabel));
      case Period.WEEK:
        return `Week ${Number(rawLabel)}`;
      case Period.YEAR:
        return Number(rawLabel);
      default:
        return rawLabel as string | number;
    }
  }

  private monthName(month: number): string {
    // Info.months is 0-indexed; SQL months are 1-indexed.
    return Info.months('long', { locale: this.locale })[month - 1];
  }

  private weekdayName(year: number, month: number, day: number): string {
    return DateTime.fromObject({ year, month, day }, { locale: this.locale }).toLocaleString({
      weekday: 'long',
    });
  }
}
