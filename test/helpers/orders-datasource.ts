import 'reflect-metadata';
import { DataSource, EntitySchema, SelectQueryBuilder } from 'typeorm';

/**
 * The `orders` fixture mirrors the table used by the original laravel-metrics
 * test suite: id, status, amount, created_at, updated_at.
 */
export interface OrderRow {
  id: number;
  status: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export const Order = new EntitySchema<OrderRow>({
  name: 'Order',
  tableName: 'orders',
  columns: {
    id: { type: Number, primary: true, generated: true },
    status: { type: String, default: 'pending' },
    amount: { type: 'decimal', precision: 10, scale: 2, default: 0 },
    created_at: { type: 'datetime', nullable: true },
    updated_at: { type: 'datetime', nullable: true },
  },
});

export interface SeedOrder {
  createdAt: string;
  status?: string;
  amount?: number;
}

/**
 * Create an in-memory SQLite DataSource with the orders schema initialized.
 * Each call is isolated, so tests never share state.
 */
export async function createOrdersDataSource(): Promise<DataSource> {
  const dataSource = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [Order],
    synchronize: true,
  });

  await dataSource.initialize();
  return dataSource;
}

export async function seedOrders(
  dataSource: DataSource,
  rows: SeedOrder[],
): Promise<void> {
  const repo = dataSource.getRepository(Order);
  await repo.insert(
    rows.map((row) => ({
      status: row.status ?? 'pending',
      amount: row.amount ?? 100,
      created_at: row.createdAt,
      updated_at: row.createdAt,
    })),
  );
}

export function ordersQuery(dataSource: DataSource): SelectQueryBuilder<OrderRow> {
  return dataSource.getRepository(Order).createQueryBuilder('orders');
}
