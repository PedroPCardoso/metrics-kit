/** The SQL aggregate functions a metrics query can apply. */
export enum Aggregate {
  /** `COUNT(...)` — number of rows. */
  COUNT = 'count',
  /** `COUNT(DISTINCT ...)` — number of distinct values in a column. */
  COUNT_DISTINCT = 'count_distinct',
  /** `AVG(...)` — mean of the column. */
  AVERAGE = 'avg',
  /** `SUM(...)` — total of the column. */
  SUM = 'sum',
  /** `MAX(...)` — largest value of the column. */
  MAX = 'max',
  /** `MIN(...)` — smallest value of the column. */
  MIN = 'min',
}
