import type { ScaffoldTemplate } from './types';

export const basicTemplate: ScaffoldTemplate = {
  name: 'basic',
  description: 'A small starter metrics service for one TypeORM query builder.',
  files: [
    {
      path: 'metrics/basic.metrics.ts',
      content: `import { Metrics } from 'nestjs-metrics';

export class BasicMetrics {
  countOrders(queryBuilder: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(queryBuilder).count().metrics();
  }

  monthlyRevenue(queryBuilder: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(queryBuilder)
      .sumByMonth('amount', 6)
      .fillMissingData()
      .trends();
  }
}
`,
    },
  ],
};
