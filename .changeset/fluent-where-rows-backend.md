---
'nestjs-metrics-core': minor
'nestjs-metrics': minor
'nextjs-metrics': minor
---

Add chainable `where()`/`whereIn()` structured filters (both modes, bound
parameters, empty IN fails closed) and a `fromRows()` entry point that runs
the full builder API over in-memory rows — bring-your-own-SQL with
timezone-correct bucketing. Internals: the builder now emits a semantic query
plan; SQL rendering moved into the backends (generated SQL unchanged).
