import type { ScaffoldTemplate } from './types';

export const saasTemplate: ScaffoldTemplate = {
  name: 'saas',
  description: 'Subscription metrics for MRR, churn and accounts growth.',
  files: [
    {
      path: 'metrics/saas.metrics.ts',
      content: `import { Metrics } from 'nestjs-metrics';

export class SaasMetrics {
  monthlyRecurringRevenue(subscriptionsQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(subscriptionsQuery)
      .sumByMonth('monthly_amount', 12)
      .fillMissingData()
      .trends();
  }

  activeAccounts(accountsQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(accountsQuery)
      .countByMonth('id', 12)
      .fillMissingData()
      .trends();
  }

  churnedSubscriptions(subscriptionsQuery: Parameters<typeof Metrics.query>[0]) {
    return Metrics.query(subscriptionsQuery)
      .countByMonth('id', 12)
      .labelColumn('status')
      .trends();
  }
}
`,
    },
  ],
};
