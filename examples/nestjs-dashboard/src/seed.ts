import { DataSource } from 'typeorm';

const now = new Date();
const rows: Array<{ status: string; amount: number; created_at: Date }> = [];

for (let i = 180; i >= 0; i--) {
  const d = new Date(now);
  d.setDate(d.getDate() - i);
  const count = Math.floor(Math.random() * 5) + 1;
  for (let j = 0; j < count; j++) {
    rows.push({
      status: ['pending', 'paid', 'refunded'][Math.floor(Math.random() * 3)],
      amount: Math.round(Math.random() * 20000 + 500) / 100,
      created_at: d,
    });
  }
}

export async function seed(dataSource: DataSource): Promise<void> {
  const repo = dataSource.getRepository('Order');
  const count = await repo.count();
  if (count > 0) return;
  await repo.insert(rows);
}
