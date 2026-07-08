---
"nestjs-metrics-core": minor
"nestjs-metrics": minor
"nextjs-metrics": minor
---

Release the merged metrics feature batch:

- add hourly granularity across dialects;
- add `countDistinct()`, `cumulative()`, `trendsWithComparison()` and `toSql()`;
- add grouped trend label auto-discovery;
- add chart output helpers under `nestjs-metrics-core/charts`;
- add query observability hooks and async cache-store support;
- add MSSQL dialect support;
- add the `nextjs-metrics/kysely` adapter;
- add NestJS and Next.js dashboard example apps.
