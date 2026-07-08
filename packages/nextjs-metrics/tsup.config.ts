import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/prisma/index.ts', 'src/drizzle/index.ts', 'src/kysely/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  external: ['nestjs-metrics-core', '@prisma/client', 'drizzle-orm', 'kysely'],
});
