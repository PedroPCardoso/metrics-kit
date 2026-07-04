import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/nestjs/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  external: ['nestjs-metrics-core'],
});
