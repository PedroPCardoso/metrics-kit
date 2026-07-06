import Database from 'better-sqlite3';
import { sqliteTable, integer, real, text } from 'drizzle-orm/sqlite-core';

export const sqlite = new Database(':memory:');

export const orders = sqliteTable('orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  status: text('status').notNull().default('pending'),
  amount: real('amount').notNull().default(0),
  createdAt: text('created_at').notNull(),
});

sqlite.exec(
  `CREATE TABLE orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    status TEXT NOT NULL DEFAULT 'pending',
    amount REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,
);

const now = new Date();
const insert = sqlite.prepare(
  'INSERT INTO orders (status, amount, created_at) VALUES (?, ?, ?)',
);
for (let i = 180; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  const count = Math.floor(Math.random() * 5) + 1;
  for (let j = 0; j < count; j++) {
    insert.run(
      ['pending', 'paid', 'refunded'][Math.floor(Math.random() * 3)],
      Math.round(Math.random() * 20000 + 500) / 100,
      d.toISOString(),
    );
  }
}

export const drizzleDb = { $client: sqlite } as const;
