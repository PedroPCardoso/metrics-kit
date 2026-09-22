---
'nestjs-metrics-core': patch
'nestjs-metrics': patch
---

Docs: make the driver adapters discoverable from the NestJS side. A consumer on
NestJS + Kysely guessed `nestjs-metrics/kysely`, hit an unexported subpath, and
had to go looking for the right specifier — the adapters (`prismaMetrics`,
`drizzleMetrics`, `kyselyMetrics`) are only reachable from `nextjs-metrics`,
whose name gives no hint that it is runtime-agnostic rather than Next.js-specific.

The core README's adapter list also still said "Next.js + Prisma/Drizzle",
predating the Kysely adapter. Both READMEs and the NestJS guide now state where
the adapters live, that the package works in any Node runtime, and that adapters
bypass `MetricsService` (so module-level locale/timezone defaults don't apply —
use `metricsService.queryExecutor(...)` when you want them). No API change.
