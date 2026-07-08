import { describe, expect, it } from 'vitest';
import { Aggregate } from '@core/enums/aggregate.enum';
import { dialectFor } from '@core/dialects/dialect.factory';

/**
 * Structural guard: pin the SQL each dialect emits for the tracer query, so a
 * change to one dialect's fragments is caught without needing a live database.
 */
describe('SQL fragments per dialect', () => {
  const dateCol = 'orders.created_at';

  it('emits the aggregate call per dialect', () => {
    expect(dialectFor('better-sqlite3').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
    expect(dialectFor('postgres').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
    expect(dialectFor('mysql').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
  });

  it('extracts the hour per dialect', () => {
    expect(dialectFor('better-sqlite3').periodExpr('hour', dateCol)).toBe(
      "CAST(strftime('%H', orders.created_at) AS INTEGER)",
    );
    expect(dialectFor('postgres').periodExpr('hour', dateCol)).toBe(
      'EXTRACT(HOUR FROM orders.created_at)',
    );
    expect(dialectFor('mysql').periodExpr('hour', dateCol)).toBe('hour(orders.created_at)');
  });

  it('buckets the hour per dialect', () => {
    expect(dialectFor('better-sqlite3').dateBucket('hour', dateCol)).toBe(
      "strftime('%Y-%m-%d', orders.created_at) || ' ' || strftime('%H', orders.created_at) || ':00'",
    );
    expect(dialectFor('postgres').dateBucket('hour', dateCol)).toBe(
      "to_char(orders.created_at, 'YYYY-MM-DD HH24:00')",
    );
    expect(dialectFor('mysql').dateBucket('hour', dateCol)).toBe(
      "date_format(orders.created_at, '%Y-%m-%d %H:00')",
    );
  });

  it('extracts the year per dialect', () => {
    expect(dialectFor('better-sqlite3').periodExpr('year', dateCol)).toBe(
      "CAST(strftime('%Y', orders.created_at) AS INTEGER)",
    );
    expect(dialectFor('postgres').periodExpr('year', dateCol)).toBe(
      'EXTRACT(YEAR FROM orders.created_at)',
    );
    expect(dialectFor('mysql').periodExpr('year', dateCol)).toBe('year(orders.created_at)');
  });

  it('maps mariadb to the MySQL dialect', () => {
    expect(dialectFor('mariadb').periodExpr('month', dateCol)).toBe(
      dialectFor('mysql').periodExpr('month', dateCol),
    );
  });

  it('throws for an unsupported driver', () => {
    expect(() => dialectFor('oracle')).toThrow(/unsupported database driver/);
  });
});
