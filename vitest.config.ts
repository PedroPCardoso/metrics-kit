import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// Tests live at the repo root and run against package SOURCE (not built dist)
// via these aliases, so the whole workspace is exercised in one vitest run.
const r = (p: string) => resolve(__dirname, p);

export default defineConfig({
  resolve: {
    alias: {
      '@metrics-kit/core': r('packages/core/src/index.ts'),
      '@metrics-kit/nestjs': r('packages/nestjs/src/index.ts'),
      '@metrics-kit/nextjs/prisma': r('packages/nextjs/src/prisma/index.ts'),
      '@metrics-kit/nextjs/drizzle': r('packages/nextjs/src/drizzle/index.ts'),
      '@metrics-kit/nextjs': r('packages/nextjs/src/index.ts'),
      '@core': r('packages/core/src'),
    },
  },
  test: {
    include: ['test/**/*.spec.ts'],
    globals: false,
    // External DB specs share one persistent Postgres/MySQL database and
    // reset it per-test; serialize files so they can't truncate each other.
    fileParallelism: false,
  },
});
