---
'nestjs-metrics-core': minor
'nestjs-metrics': minor
'nextjs-metrics': minor
---

Add chainable `where()`/`whereIn()` structured filters (both modes, bound
parameters, empty IN fails closed) and a `fromRows()` entry point that runs
the full builder API over in-memory rows — bring-your-own-SQL with
timezone-correct bucketing, now including `hour` granularity and
`countDistinct()`. `fromRows()` arguments are Zod-validated like every other
entry point, and its exceptions (`InvalidRowDateException`,
`UnsupportedInRowsModeException`) are part of the standard `MetricsError`
hierarchy. `groupData()`'s auto-discovered label set now respects
`where()`/`whereIn()` scoping in both SQL and rows mode (it previously did
not, for either mode — a pre-existing gap closed as part of this change).

Internals: the builder emits a semantic query plan; SQL rendering moved into
the backends (generated SQL unchanged). Reconciled with the caching,
`hour` period, `COUNT_DISTINCT`, and typed-error work shipped in parallel.
