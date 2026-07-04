# Error Codes

All library exceptions extend `MetricsError` and expose a stable `code`.
`JSON.stringify(error)` redacts `context.params`; raw params remain available in-process at `error.context?.params` for trusted debugging.

| Code | Thrown by | Meaning | Typical fix |
| --- | --- | --- | --- |
| `VALIDATION_ERROR` | `ValidationError` | Zod rejected options or executor spec input. | Check the reported issue paths; use valid locale/timezone/cache values and safe identifiers. |
| `INVALID_AGGREGATE` | `InvalidAggregateException` | An unsupported aggregate was requested. | Use `count`, `sum`, `avg`, `min`, or `max`. |
| `INVALID_DATE_FORMAT` | `InvalidDateFormatException` | A date argument was not `YYYY-MM-DD`. | Pass ISO date strings such as `2026-01-31`. |
| `INVALID_IDENTIFIER` | `InvalidIdentifierException` | A table or column name failed the SQL identifier allowlist. | Use plain identifiers: letters, numbers, underscores, and dot-separated paths. |
| `INVALID_PERIOD` | `InvalidPeriodException` | `metricsWithVariations` received an unsupported period. | Use day, week, month, or year periods. |
| `INVALID_TIMEZONE` | `InvalidTimezoneException` | The timezone was not `UTC` or a valid IANA zone. | Use values such as `UTC` or `America/Sao_Paulo`. |
| `INVALID_VARIATIONS_COUNT` | `InvalidVariationsCountException` | Variation comparison count was not positive. | Pass a `previousCount` greater than zero. |
| `SQLITE_TIMEZONE_UNSUPPORTED` | `SqliteTimezoneUnsupportedException` | Executor-mode SQLite was asked for non-UTC timezone bucketing. | Use UTC in SQLite executor mode or use Postgres/MySQL for timezone-aware trends. |
| `CONFIGURATION_ERROR` | `ConfigurationError` | Adapter or dialect configuration could not be resolved. | Pass the dialect explicitly or use a supported driver/table object. |
| `MISSING_BOUND_PARAMETER` | `MetricsError` | Generated SQL referenced a named parameter that was not provided. | Report this as a library bug with the query chain that produced it. |
| `QUERY_EXECUTION_ERROR` | `QueryExecutionError` | The database driver rejected the generated query. | Inspect `error.context.query`, dialect, and the original `cause`; params are redacted in JSON logs. |
