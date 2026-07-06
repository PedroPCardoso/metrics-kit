# Metrics Kit examples

Each folder contains a self-contained example showing how to generate metrics
and trends for dashboards.

| Example | Stack | Package |
|---|---|---|
| [`nestjs-typeorm`](./nestjs-typeorm) | NestJS + TypeORM | `nestjs-metrics` |
| [`nextjs-prisma`](./nextjs-prisma) | Next.js + Prisma | `nextjs-metrics/prisma` |
| [`nextjs-drizzle`](./nextjs-drizzle) | Next.js + Drizzle | `nextjs-metrics/drizzle` |

All examples assume you already have a database connection configured in your
project. The snippets focus on the Metrics Kit API.

## Running an example

```bash
cd examples/<example>
npm install
npm run start
```

> These examples install the published packages from npm. If you want to run them
> against the local workspace, replace the dependency versions with `*` and use
> the monorepo's npm workspaces.
