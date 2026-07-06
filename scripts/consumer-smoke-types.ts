import { Metrics, metricsFor, withMetrics } from 'nestjs-metrics';
import { MetricsModule, MetricsService } from 'nestjs-metrics/nestjs';
import { MetricsBuilder } from 'nestjs-metrics-core';
import { prismaMetrics } from 'nextjs-metrics/prisma';
import { drizzleMetrics } from 'nextjs-metrics/drizzle';
import { kyselyMetrics } from 'nextjs-metrics/kysely';
import * as nextjsMetrics from 'nextjs-metrics';

void Metrics;
void metricsFor;
void withMetrics;
void MetricsModule;
void MetricsService;
void MetricsBuilder;
void prismaMetrics;
void drizzleMetrics;
void kyselyMetrics;
void nextjsMetrics;
