import { describe, expect, it } from 'vitest';
import { RowsBackend } from '@core/backend/rows.backend';
import { SemanticPlan } from '@core/backend/semantic-plan';
import { Aggregate } from '@core/enums/aggregate.enum';
import { InvalidRowDateException } from '@core/exceptions/invalid-row-date.exception';

const col = (column: string) => ({ table: 'rows', column });

const rows = [
  { created_at: '2026-01-10T12:00:00Z', amount: 100, status: 'paid', member_id: 1 },
  { created_at: '2026-01-20T12:00:00Z', amount: 50, status: 'pending', member_id: 2 },
  { created_at: '2026-02-05T12:00:00Z', amount: 200, status: 'paid', member_id: 1 },
  { created_at: new Date('2026-03-01T12:00:00Z'), amount: 300, status: 'paid', member_id: 3 },
];

/** `source` is opaque cache-key material the rows backend ignores. */
type Plan = Omit<SemanticPlan, 'source'>;

const run = (plan: Plan, data: Record<string, unknown>[] = rows) =>
  new RowsBackend(data).run({ source: 'rows', ...plan });

describe('RowsBackend', () => {
  it('aggregates a bare metric', async () => {
    const out = await run({
      select: [{ expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' }],
      filters: [],
    });
    expect(out).toEqual([{ data: 650 }]);
  });

  it('buckets a monthly trend with period filters and orders by label', async () => {
    const out = await run({
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' },
        { expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' },
      ],
      filters: [{ kind: 'periodEq', part: 'year', value: 2026, date: col('created_at') }],
      groupByLabel: true,
      orderByLabel: 'ASC',
    });
    expect(out).toEqual([
      { data: 150, label: 1 },
      { data: 200, label: 2 },
      { data: 300, label: 3 },
    ]);
  });

  it('applies structured where with SQL semantics (empty IN = nothing, null, range)', async () => {
    const count = (filters: SemanticPlan['filters']) =>
      run({
        select: [{ expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('member_id') }, alias: 'data' }],
        filters,
      });
    expect(await count([{ kind: 'where', column: col('member_id'), condition: [1, 3] }])).toEqual([{ data: 3 }]);
    expect(await count([{ kind: 'where', column: col('member_id'), condition: [] }])).toEqual([{ data: 0 }]);
    expect(await count([{ kind: 'where', column: col('amount'), condition: { gte: 100, lt: 300 } }])).toEqual([{ data: 2 }]);
    expect(await count([{ kind: 'where', column: col('status'), condition: null }])).toEqual([{ data: 0 }]);
  });

  it('extracts periods in the configured timezone (UTC−3 month boundary)', async () => {
    // 2026-03-01T01:00Z is still 2026-02-28 in America/Sao_Paulo (UTC−3).
    const boundary = [{ created_at: '2026-03-01T01:00:00Z', amount: 10 }];
    const plan = (tz?: string): Plan => ({
      select: [{ expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' },
               { expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' }],
      filters: [],
      groupByLabel: true,
      orderByLabel: 'ASC',
      tz,
    });
    expect(await run(plan(), boundary)).toEqual([{ label: 3, data: 10 }]);
    expect(await run(plan('America/Sao_Paulo'), boundary)).toEqual([{ label: 2, data: 10 }]);
  });

  it('computes date buckets, grouped aggregates and distinct labels', async () => {
    const bucketed = await run({
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('member_id') }, alias: 'data' },
        { expr: { kind: 'bucket', part: 'month', date: col('created_at') }, alias: 'label' },
        { expr: { kind: 'groupedAggregate', fn: Aggregate.SUM, column: col('status'), value: 'paid', index: 0 }, alias: 'data0' },
      ],
      filters: [{ kind: 'dateBetween', start: '2026-01-01', end: '2026-02-28', date: col('created_at') }],
      groupByLabel: true,
      orderByLabel: 'ASC',
    });
    expect(bucketed).toEqual([
      { data: 2, label: '2026-01', data0: 1 },
      { data: 1, label: '2026-02', data0: 1 },
    ]);

    const distinct = await run({
      select: [{ expr: { kind: 'column', column: col('status') }, alias: 'label' }],
      filters: [],
      distinct: true,
      orderByLabel: 'ASC',
    });
    expect(distinct).toEqual([{ label: 'paid' }, { label: 'pending' }]);
  });

  it('matches range conditions on non-numeric columns (string/date), not just numbers', async () => {
    const count = (filters: SemanticPlan['filters']) =>
      run({
        select: [{ expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('member_id') }, alias: 'data' }],
        filters,
      });
    // Date-string range: rows 2..4 are on/after 2026-01-20.
    expect(
      await count([{ kind: 'where', column: col('created_at'), condition: { gte: '2026-01-20T00:00:00Z' } }]),
    ).toEqual([{ data: 3 }]);
    // String range: status >= 'p' matches 'paid' and 'pending', not empty.
    expect(await count([{ kind: 'where', column: col('status'), condition: { gte: 'p' } }])).toEqual([
      { data: 4 },
    ]);
  });

  it('an empty range condition matches every row, including rows with null values in that column', async () => {
    const withNull = [...rows, { created_at: '2026-04-01T00:00:00Z', amount: 400, status: null, member_id: null }];
    const out = await run(
      {
        select: [{ expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('member_id') }, alias: 'data' }],
        filters: [{ kind: 'where', column: col('status'), condition: {} }],
      },
      withNull,
    );
    // COUNT ignores nulls itself, but all 5 rows must pass the empty-range filter.
    expect(out).toEqual([{ data: 4 }]);
    // Distinct labels over the full set (including the null row) must include
    // all 3 distinct status representations — proving the null row wasn't
    // silently excluded by the empty-range filter.
    const passed = await run(
      {
        select: [{ expr: { kind: 'column', column: col('status') }, alias: 'label' }],
        filters: [{ kind: 'where', column: col('status'), condition: {} }],
        distinct: true,
      },
      withNull,
    );
    expect(passed).toEqual([{ label: 'null' }, { label: 'paid' }, { label: 'pending' }]);
  });

  it('MAX/MIN over a string/date column return the real extreme value, not 0', async () => {
    const out = await run({
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.MAX, column: col('status') }, alias: 'maxStatus' },
        { expr: { kind: 'aggregate', fn: Aggregate.MIN, column: col('status') }, alias: 'minStatus' },
      ],
      filters: [],
    });
    expect(out).toEqual([{ maxStatus: 'pending', minStatus: 'paid' }]);

    const dateRows = [
      { d: '2026-01-05T00:00:00Z' },
      { d: '2026-03-01T00:00:00Z' },
      { d: '2026-02-10T00:00:00Z' },
    ];
    const dateOut = await run(
      {
        select: [{ expr: { kind: 'aggregate', fn: Aggregate.MAX, column: col('d') }, alias: 'maxDate' }],
        filters: [],
      },
      dateRows,
    );
    expect(dateOut).toEqual([{ maxDate: '2026-03-01T00:00:00Z' }]);
  });

  it('fails fast on an unparseable date, naming the row index', async () => {
    const bad = [{ created_at: 'not-a-date', amount: 1 }];
    await expect(
      run({
        select: [{ expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' }],
        filters: [],
        groupByLabel: true,
      }, bad),
    ).rejects.toThrow(InvalidRowDateException);
  });

  it('reports the original row index (not the post-filter position) when a later row has an unparseable date', async () => {
    const bad = [
      { status: 'other', created_at: '2026-01-01T00:00:00Z' },
      { status: 'y', created_at: 'not-a-date' },
    ];
    await expect(
      run(
        {
          select: [{ expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' }],
          filters: [{ kind: 'where', column: col('status'), condition: 'y' }],
          groupByLabel: true,
        },
        bad,
      ),
    ).rejects.toThrow('row 1 has an unparseable date value');
  });
});
