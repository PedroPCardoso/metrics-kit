import { Period } from '../enums/period.enum';
import { TrendsResult } from '../types';
import { LabelContext, LabelFormatter } from './label-formatter';

export interface RawTrendRow {
  data: unknown;
  label: unknown;
}

/**
 * Turns the raw `{ data, label }` rows returned by a grouped trends query into
 * the parallel `{ labels, data }` arrays a chart consumes, translating each
 * label through the LabelFormatter.
 */
export class TrendsFormatter {
  constructor(private readonly labels: LabelFormatter) {}

  format(
    rows: RawTrendRow[],
    period: Period | null,
    ctx: LabelContext,
    inPercent = false,
  ): TrendsResult {
    const result: TrendsResult = { labels: [], data: [] };

    for (const row of rows) {
      result.labels.push(this.labels.format(row.label, period, ctx));
      result.data.push(Number(row.data));
    }

    return inPercent ? this.toPercent(result) : result;
  }

  private toPercent(result: TrendsResult): TrendsResult {
    const total = result.data.reduce((sum, value) => sum + value, 0);
    if (total === 0) {
      return result;
    }
    return {
      labels: result.labels,
      data: result.data.map((value) => Math.round((value / total) * 100 * 100) / 100),
    };
  }
}
