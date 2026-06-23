# Divergences from `eliseekn/laravel-metrics`

This is an idiomatic port, not a bug-for-bug clone (see docs/ARCHITECTURE.md §0,
decision 3). Behaviour matches the original by default; the deliberate
deviations below are listed so consumers know where and why we differ.

## 1. Terminals are async

The PHP API is synchronous. TypeORM executes queries asynchronously, so the
terminal methods (`metrics()`, `trends()`, and — later — `metricsWithVariations()`)
return a `Promise`. The fluent chain itself stays synchronous and chainable.

## 2. ISO-8601 week numbering, uniform across dialects

The original is internally inconsistent: it numbers weeks with `Carbon::week`
in PHP but with `WEEK()` / `EXTRACT(WEEK)` / `strftime('%W')` in SQL, which use
different week definitions and disagree across databases. This port uses
**ISO-8601** week numbering everywhere — Postgres `EXTRACT(WEEK)`, MySQL
`WEEKOFYEAR` (`WEEK(col, 3)`), and a Thursday-based formula on SQLite — so the
same date yields the same week number on every database.

## 3. `byYear` window lower bound is reference-based

For a multi-unit window (`byX(n)` with `n > 1`), the original computes the
lower bound relative to the **pinned reference** for day/week/month
(`$this->carbon()->subDays/subWeeks/subMonths`), but uniquely for **year** it
uses `Carbon::now()->subYears($count)` — relative to *now*, ignoring `forYear`.

This port makes `byYear(n)` consistent with the other periods: the window is
`[forYear - n, forYear]`. This produces coherent results when `forYear` pins a
historical year (the original would mix a now-based lower bound with a pinned
upper bound).

## 4. Private `windowCount` field

The original has both a `$count` property (the period window size) and a
`count()` method (the COUNT aggregate); PHP keeps these in separate namespaces.
In JavaScript a field and a method share one namespace, so the field is named
`windowCount` to avoid shadowing the `count()` method.
