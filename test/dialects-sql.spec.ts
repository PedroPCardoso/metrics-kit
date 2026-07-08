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

  it('extracts the year per dialect', () => {
    expect(dialectFor('better-sqlite3').periodExpr('year', dateCol)).toBe(
      "CAST(strftime('%Y', orders.created_at) AS INTEGER)",
    );
    expect(dialectFor('postgres').periodExpr('year', dateCol)).toBe(
      'EXTRACT(YEAR FROM orders.created_at)',
    );
    expect(dialectFor('mysql').periodExpr('year', dateCol)).toBe('year(orders.created_at)');
  });

  it('extracts day, week and month per dialect', () => {
    expect(dialectFor('postgres').periodExpr('day', dateCol)).toBe(
      'EXTRACT(DAY FROM orders.created_at)',
    );
    expect(dialectFor('postgres').periodExpr('week', dateCol)).toBe(
      'EXTRACT(WEEK FROM orders.created_at)',
    );
    expect(dialectFor('postgres').periodExpr('month', dateCol)).toBe(
      'EXTRACT(MONTH FROM orders.created_at)',
    );
    expect(dialectFor('mysql').periodExpr('day', dateCol)).toBe('day(orders.created_at)');
    expect(dialectFor('mysql').periodExpr('week', dateCol)).toBe('WEEKOFYEAR(orders.created_at)');
    expect(dialectFor('mysql').periodExpr('month', dateCol)).toBe('month(orders.created_at)');
  });

  it('buckets day, week, month and year per dialect', () => {
    expect(dialectFor('postgres').dateBucket('day', dateCol)).toBe(
      "to_char(orders.created_at, 'YYYY-MM-DD')",
    );
    expect(dialectFor('postgres').dateBucket('week', dateCol)).toBe(
      'to_char(orders.created_at, \'IYYY-"W"IW\')',
    );
    expect(dialectFor('postgres').dateBucket('month', dateCol)).toBe(
      "to_char(orders.created_at, 'YYYY-MM')",
    );
    expect(dialectFor('postgres').dateBucket('year', dateCol)).toBe(
      "to_char(orders.created_at, 'YYYY')",
    );
    expect(dialectFor('mysql').dateBucket('day', dateCol)).toBe(
      "date_format(orders.created_at, '%Y-%m-%d')",
    );
    expect(dialectFor('mysql').dateBucket('week', dateCol)).toBe(
      "date_format(orders.created_at, '%x-W%v')",
    );
    expect(dialectFor('mysql').dateBucket('month', dateCol)).toBe(
      "date_format(orders.created_at, '%Y-%m')",
    );
    expect(dialectFor('mysql').dateBucket('year', dateCol)).toBe(
      "date_format(orders.created_at, '%Y')",
    );
  });

  it('escapes identifiers, placeholders and timezone conversion per dialect', () => {
    expect(dialectFor('postgres').escapeId('weird"name')).toBe('"weird""name"');
    expect(dialectFor('postgres').placeholder(3)).toBe('$3');
    expect(dialectFor('postgres').convertTz('orders.created_at', ':tz')).toBe(
      "((orders.created_at) AT TIME ZONE 'UTC' AT TIME ZONE :tz)",
    );
    expect(dialectFor('mysql').escapeId('weird`name')).toBe('`weird``name`');
    expect(dialectFor('mysql').placeholder(3)).toBe('?');
    expect(dialectFor('mysql').convertTz('orders.created_at', ':tz')).toBe(
      "CONVERT_TZ(orders.created_at, 'UTC', :tz)",
    );
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
