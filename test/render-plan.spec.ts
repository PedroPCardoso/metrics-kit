import { describe, expect, it } from 'vitest';
import { renderPlan } from '@core/backend/render-plan';
import { SemanticPlan } from '@core/backend/semantic-plan';
import { dialectFor } from '@core/dialects/dialect.factory';
import { Aggregate } from '@core/enums/aggregate.enum';

const dialect = dialectFor('postgres');
const esc = (name: string) => dialect.escapeId(name);
const col = (column: string) => ({ table: 'orders', column });

describe('renderPlan', () => {
  it('renders an aggregate metric with period filters (matches legacy SQL)', () => {
    const plan: SemanticPlan = {
      source: 'orders',
      select: [{ expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' }],
      filters: [
        { kind: 'periodEq', part: 'year', value: 2026, date: col('created_at') },
        { kind: 'periodEq', part: 'month', value: 3, date: col('created_at') },
      ],
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.select).toEqual([{ expr: 'sum("orders"."amount")', alias: 'data' }]);
    expect(rendered.where).toEqual([
      'EXTRACT(YEAR FROM "orders"."created_at") = :nm_year',
      'EXTRACT(MONTH FROM "orders"."created_at") = :nm_month',
    ]);
    expect(rendered.params).toEqual({ nm_year: 2026, nm_month: 3 });
  });

  it('renders period label + groupBy/orderBy for trends', () => {
    const plan: SemanticPlan = {
      source: 'orders',
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('id') }, alias: 'data' },
        { expr: { kind: 'period', part: 'month', date: col('created_at') }, alias: 'label' },
      ],
      filters: [],
      groupByLabel: true,
      orderByLabel: 'ASC',
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.groupBy).toBe('label');
    expect(rendered.orderBy).toEqual({ expr: 'label', dir: 'ASC' });
  });

  it('applies timezone conversion to date expressions and binds nm_tz', () => {
    const plan: SemanticPlan = {
      source: 'orders',
      select: [{ expr: { kind: 'period', part: 'day', date: col('created_at') }, alias: 'label' }],
      filters: [],
      tz: 'America/Sao_Paulo',
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.select[0].expr).toContain(':nm_tz');
    expect(rendered.params.nm_tz).toBe('America/Sao_Paulo');
    expect(rendered.tz).toBe('America/Sao_Paulo');
  });

  it('renders structured where filters with sequential nm_w params', () => {
    const plan: SemanticPlan = {
      source: 'orders',
      select: [{ expr: { kind: 'aggregate', fn: Aggregate.COUNT, column: col('id') }, alias: 'data' }],
      filters: [
        { kind: 'where', column: col('status'), condition: 'paid' },
        { kind: 'where', column: col('member_id'), condition: [1, 2, 3] },
        { kind: 'where', column: col('deleted_at'), condition: null },
        { kind: 'where', column: col('amount'), condition: { gte: 10 } },
        { kind: 'where', column: col('tenant_id'), condition: [] },
      ],
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.where).toEqual([
      '"orders"."status" = :nm_w0',
      '"orders"."member_id" IN (:nm_w1, :nm_w2, :nm_w3)',
      '"orders"."deleted_at" IS NULL',
      '"orders"."amount" >= :nm_w4',
      '1 = 0',
    ]);
    expect(rendered.params).toEqual({ nm_w0: 'paid', nm_w1: 1, nm_w2: 2, nm_w3: 3, nm_w4: 10 });
  });

  it('renders dateBetween, grouped aggregates and distinct column selects', () => {
    const plan: SemanticPlan = {
      source: 'orders',
      select: [
        { expr: { kind: 'aggregate', fn: Aggregate.SUM, column: col('amount') }, alias: 'data' },
        { expr: { kind: 'bucket', part: 'day', date: col('created_at') }, alias: 'label' },
        { expr: { kind: 'groupedAggregate', fn: Aggregate.SUM, column: col('status'), value: 'paid', index: 0 }, alias: 'data0' },
      ],
      filters: [{ kind: 'dateBetween', start: '2026-01-01', end: '2026-03-31', date: col('created_at') }],
      groupByLabel: true,
      orderByLabel: 'ASC',
    };
    const rendered = renderPlan(plan, dialect, esc);
    expect(rendered.select[2]).toEqual({
      expr: 'sum(CASE WHEN "orders"."status" = :nm_g0 THEN 1 ELSE 0 END)',
      alias: 'data0',
    });
    expect(rendered.params).toMatchObject({ nm_g0: 'paid', nm_start: '2026-01-01', nm_end: '2026-03-31' });

    const distinctPlan: SemanticPlan = {
      source: 'orders',
      select: [{ expr: { kind: 'column', column: col('status') }, alias: 'label' }],
      filters: [],
      distinct: true,
      orderByLabel: 'ASC',
    };
    expect(renderPlan(distinctPlan, dialect, esc).distinct).toBe(true);
  });
});
