import Database from 'better-sqlite3';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// The adapters are imported from their ISOLATED subpaths — `nextjs-metrics/prisma`
// and `nextjs-metrics/drizzle` — not the root barrel. This pins issue #16's
// stories 18 & 19: each adapter resolves under its own subpath (so importing one
// never loads the other), in addition to the root re-export kept for back-compat.
import { prismaMetrics, type PrismaClientLike } from 'nextjs-metrics/prisma';
import { drizzleMetrics, type DrizzleClientLike } from 'nextjs-metrics/drizzle';

describe('nextjs adapters via isolated subpaths (/prisma, /drizzle)', () => {
  let db: Database.Database;
  let prisma: PrismaClientLike;
  let drizzle: DrizzleClientLike;

  beforeAll(() => {
    db = new Database(':memory:');
    db.exec(
      'CREATE TABLE orders (id INTEGER PRIMARY KEY, amount REAL, status TEXT, created_at TEXT)',
    );
    const insert = db.prepare(
      'INSERT INTO orders (amount, status, created_at) VALUES (?, ?, ?)',
    );
    for (const [amount, status, date] of [
      [100, 'paid', '2026-01-10'],
      [50, 'pending', '2026-01-20'],
      [200, 'paid', '2026-02-05'],
      [75, 'refunded', '2026-02-15'],
      [300, 'paid', '2026-03-01'],
      [25, 'pending', '2026-03-20'],
      [150, 'paid', '2026-05-11'],
    ] as [number, string, string][]) {
      insert.run(amount, status, date);
    }

    prisma = {
      $queryRawUnsafe: async <T>(sql: string, ...params: unknown[]) =>
        db.prepare(sql).all(...params) as T,
    };
    drizzle = { $client: db };
  });

  afterAll(() => db.close());

  const spec = { table: 'orders', dateColumn: 'created_at', dialect: 'sqlite' as const };

  it('nextjs-metrics/prisma exposes a working prismaMetrics', async () => {
    expect(await prismaMetrics(prisma, spec).count().metrics()).toBe(7);
    expect(await prismaMetrics(prisma, spec).sum('amount').metrics()).toBe(900);
  });

  it('nextjs-metrics/drizzle exposes a working drizzleMetrics', async () => {
    expect(await drizzleMetrics(drizzle, spec).count().metrics()).toBe(7);
    expect(await drizzleMetrics(drizzle, spec).sum('amount').metrics()).toBe(900);
  });
});
