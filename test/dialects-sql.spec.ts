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
    expect(dialectFor('mssql').aggregate(Aggregate.COUNT, 'orders.id')).toBe(
      'count(orders.id)',
    );
    expect(dialectFor('postgres').aggregate(Aggregate.COUNT_DISTINCT, 'orders.status')).toBe(
      'count(DISTINCT orders.status)',
    );
    expect(dialectFor('mysql').aggregate(Aggregate.COUNT_DISTINCT, 'orders.status')).toBe(
      'count(DISTINCT orders.status)',
    );
    expect(dialectFor('mssql').aggregate(Aggregate.COUNT_DISTINCT, 'orders.status')).toBe(
      'count(DISTINCT orders.status)',
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
    expect(dialectFor('mssql').periodExpr('hour', dateCol)).toBe(
      'DATEPART(hour, orders.created_at)',
    );
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
    expect(dialectFor('mssql').dateBucket('hour', dateCol)).toBe(
      "CONVERT(varchar(13), orders.created_at, 120) + ':00'",
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
    expect(dialectFor('mssql').periodExpr('year', dateCol)).toBe(
      'DATEPART(year, orders.created_at)',
    );
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
    expect(dialectFor('mssql').periodExpr('day', dateCol)).toBe(
      'DATEPART(day, orders.created_at)',
    );
    expect(dialectFor('mssql').periodExpr('week', dateCol)).toBe(
      'DATEPART(iso_week, orders.created_at)',
    );
    expect(dialectFor('mssql').periodExpr('month', dateCol)).toBe(
      'DATEPART(month, orders.created_at)',
    );
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
    expect(dialectFor('mssql').dateBucket('day', dateCol)).toBe(
      'CONVERT(varchar(10), orders.created_at, 23)',
    );
    expect(dialectFor('mssql').dateBucket('month', dateCol)).toBe(
      'CONVERT(varchar(7), orders.created_at, 23)',
    );
    expect(dialectFor('mssql').dateBucket('year', dateCol)).toBe(
      'CONVERT(varchar(4), orders.created_at, 23)',
    );
    expect(dialectFor('mssql').dateBucket('week', dateCol)).toContain('DATEPART(iso_week');
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
    expect(dialectFor('mssql').escapeId('weird]name')).toBe('[weird]]name]');
    expect(dialectFor('mssql').placeholder(3)).toBe('@p3');
    expect(dialectFor('mssql').convertTz('orders.created_at', '@p1')).toBe(
      "(orders.created_at) AT TIME ZONE 'UTC' AT TIME ZONE @p1",
    );
  });

  it('maps mariadb to the MySQL dialect', () => {
    expect(dialectFor('mariadb').periodExpr('month', dateCol)).toBe(
      dialectFor('mysql').periodExpr('month', dateCol),
    );
  });

  it('maps mssql driver', () => {
    expect(dialectFor('mssql').periodExpr('month', dateCol)).toBe(
      'DATEPART(month, orders.created_at)',
    );
  });

  it('throws for an unsupported driver', () => {
    expect(() => dialectFor('oracle')).toThrow(/unsupported database driver/);
  });
});
