import { DateTime } from 'luxon';

export interface PeriodReference {
  year: number;
  month: number;
  day: number;
  week: number;
  hour: number;
}

/**
 * Computes the [start, end] window bounds for a "last N units" query, ported
 * from the original laravel-metrics DatesFunctions. Windows are clamped to the
 * start of the parent period (month for day/week, year for month, day for hour).
 */
export class PeriodResolver {
  constructor(
    private readonly ref: PeriodReference,
    private readonly count: number,
    private readonly now: DateTime = DateTime.now(),
  ) {}

  private carbon(): DateTime {
    return DateTime.fromObject({
      year: this.ref.year,
      month: this.ref.month,
      day: this.ref.day,
    });
  }

  hourPeriod(): [number, number] {
    const hour =
      this.ref.day !== this.now.day
        ? 23
        : this.ref.hour;
    const diff = hour - 0;

    if (diff < this.count) {
      return [0, hour];
    }
    return [hour - this.count, hour];
  }

  dayPeriod(): [number, number] {
    const day =
      this.ref.month !== this.now.month
        ? this.carbon().endOf('month').day
        : this.ref.day;
    const diff = day - this.carbon().startOf('month').day;

    if (diff < this.count) {
      return [this.carbon().startOf('month').day, day];
    }
    return [this.carbon().minus({ days: this.count }).day, day];
  }

  weekPeriod(): [number, number] {
    const week =
      this.ref.month !== this.now.month
        ? this.carbon().endOf('month').weekNumber
        : this.ref.week;
    const diff = week - this.carbon().startOf('month').weekNumber;

    if (diff < this.count) {
      return [this.carbon().startOf('month').weekNumber, week];
    }
    return [this.carbon().minus({ weeks: this.count }).weekNumber, week];
  }

  monthPeriod(): [number, number] {
    const month =
      this.ref.year !== this.now.year ? this.carbon().endOf('year').month : this.ref.month;
    const diff = month - this.carbon().startOf('year').month;

    if (diff < this.count) {
      return [this.carbon().startOf('year').month, month];
    }
    return [this.carbon().minus({ months: this.count }).month, month];
  }
}
