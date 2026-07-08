/** The time-bucketing periods a trend series can be grouped by. */
export enum Period {
  /** The current day. */
  TODAY = 'today',
  /** Hourly buckets. */
  HOUR = 'hour',
  /** Daily buckets. */
  DAY = 'day',
  /** Weekly buckets (ISO-8601 weeks). */
  WEEK = 'week',
  /** Monthly buckets. */
  MONTH = 'month',
  /** Yearly buckets. */
  YEAR = 'year',
}
