import type { ScaffoldTemplate } from './types';

export const ecommerceTemplate: ScaffoldTemplate = {
  name: 'ecommerce',
  description: 'Revenue, order and product metrics for an ecommerce dashboard.',
  files: [
    {
      path: 'metrics/ecommerce.metrics.ts',
      content: `import { Metrics } from 'nestjs-metrics';

export class EcommerceMetrics {
  totalRevenue(ordersQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(ordersQuery).sum('amount').metrics();
  }

  monthlyRevenue(ordersQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(ordersQuery)
      .sumByMonth('amount', 12)
      .fillMissingData()
      .trends();
  }

  averageOrderValue(ordersQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(ordersQuery).average('amount').metrics();
  }

  ordersByStatus(ordersQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(ordersQuery)
      .countByMonth('id', 12)
      .labelColumn('status')
      .trends();
  }
}
`,
    },
  ],
};
