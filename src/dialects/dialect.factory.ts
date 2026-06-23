import { SqlDialect } from './sql-dialect.interface';
import { SqliteDialect } from './sqlite.dialect';

/**
 * Resolve the SqlDialect strategy from the TypeORM driver type.
 * Postgres and MySQL/MariaDB are added in a later slice.
 */
export function dialectFor(driverType: string): SqlDialect {
  switch (driverType) {
    case 'sqlite':
    case 'better-sqlite3':
      return new SqliteDialect();
    default:
      throw new Error(`nestjs-metrics: unsupported database driver "${driverType}"`);
  }
}
