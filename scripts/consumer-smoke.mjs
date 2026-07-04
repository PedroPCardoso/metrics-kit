import assert from 'node:assert';
import 'reflect-metadata';

import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';
import { MetricsBuilder } from 'nestjs-metrics-core';
import { prismaMetrics } from 'nextjs-metrics/prisma';
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import * as nextjsMetrics from 'nextjs-metrics';

assert.strictEqual(typeof Metrics, 'function');
assert.strictEqual(typeof metricsFor, 'function');
assert.strictEqual(typeof withMetrics, 'function');
assert.strictEqual(typeof MetricsModule.forRoot, 'function');
assert.strictEqual(typeof MetricsService, 'function');
assert.strictEqual(typeof MetricsBuilder, 'function');
assert.strictEqual(typeof prismaMetrics, 'function');
assert.strictEqual(typeof drizzleMetrics, 'function');
assert.strictEqual(typeof nextjsMetrics.prismaMetrics, 'function');
assert.strictEqual(typeof nextjsMetrics.drizzleMetrics, 'function');

console.log('✓ consumer smoke OK — ESM package imports and subpaths resolve');
