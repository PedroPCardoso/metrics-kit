import { DataSource, EntitySchema } from 'typeorm';

export const Order = new EntitySchema({
  name: 'Order',
  tableName: 'orders',
  columns: {
    id: { type: Number, primary: true, generated: true },
    status: { type: String },
    amount: { type: 'decimal', precision: 10, scale: 2 },
    created_at: { type: Date },
  },
});

export function createDataSource(): Promise<DataSource> {
  const ds = new DataSource({
    type: 'better-sqlite3',
    database: ':memory:',
    entities: [Order],
    synchronize: true,
  });
  return ds.initialize();
}
