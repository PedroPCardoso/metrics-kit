---
'nestjs-metrics': minor
---

`MetricsService` now exposes `queryExecutor()` and `fromRows()` alongside
`query()`. Previously the injectable service had exactly one method, taking a
TypeORM `SelectQueryBuilder` — so a NestJS app on Kysely, Prisma, Drizzle or raw
SQL could install the package (since `typeorm` became an optional peer in 0.6.1)
but had nothing usable in it: the only way to reach `queryExecutor`/`fromRows`
was the static `MetricsBuilder`, which bypasses the module entirely and forces
you to re-pass `locale`/`timezone` on every call.

Both new methods resolve options with the same precedence as `query()`:
call-site > `forFeature` > `forRoot` > library default.

One deliberate asymmetry: the module-wide `cache` default is **not** propagated
into `fromRows()`. In-memory rows have no stable query identity to key a cache
entry on, so `fromRows()` rejects caching — propagating a global
`cache: { enabled: true }` would make every rows-mode call throw. Passing
`cache` explicitly at the call site still throws `ConfigurationError`, as on the
static builder.
