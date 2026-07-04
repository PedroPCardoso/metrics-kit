# All Open Issues Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resolve all currently open GitHub issues (#26, #30, #32, #34, #42, #43, #44, #45, #46, #47) in separate execution units, then open one complete PR with new tests where needed.

**Architecture:** Execute one branch and one PR, but keep each issue isolated as its own implementation unit and commit group. Start every issue by rereading `CLAUDE.md` and the issue body, then implement smallest testable slices. Cache-related issues are sequenced first because #42, #43, #45, and #47 touch the same public options and cache-key behavior.

**Tech Stack:** TypeScript 5, NestJS 10/11, TypeORM 0.3, Vitest 2, tsup 8, TypeDoc 0.28, npm workspaces, Changesets, GitHub Actions, Docker Compose.

## Global Constraints

- Read `CLAUDE.md` before starting every issue.
- Use Docker for dev commands: do not run `npm install`, `npm test`, `npm run build`, `npm run lint`, or `npm run typecheck` directly on the host. Host-side read-only inspection commands such as `sed`, `rg`, `git status`, and `gh issue view` are allowed.
- Base branch is `origin/master`; PR base is `master`.
- Do not rename the current branch unless explicitly requested.
- Preserve the `nestjs/package.json`, `prisma/package.json`, and `drizzle/package.json` physical subpath stubs unless the implementation proves classic `moduleResolution: "node"` still resolves without them. `CLAUDE.md` currently says not to delete them.
- Keep `"nestjs"`, `"prisma"`, and `"drizzle"` in package `files` while the physical stubs exist.
- Use new tests for behavior changes and regressions.
- Use a changeset for package changes unless the auto changeset workflow is intentionally relied on for the PR.
- Avoid repeated README churn. During implementation, collect doc notes in `.context/docs-updates.md`; consolidate README/docs edits in the documentation-oriented tasks (#46 and #34), except where a specific issue's acceptance criteria requires docs in the same commit.
- After implementation, reanalyze the developed code and GitHub CI/CD. If there is any gap, test failure, CI failure, PR problem, or suspicious behavior, send the problem back through `mcp__opencode_deepseek.run_opencode_deepseek`, apply its useful corrections, and rerun verification.

## Mandatory Per-Issue Protocol

- [ ] Read repo guidance:

```bash
sed -n '1,260p' CLAUDE.md
```

- [ ] Read the exact issue context:

```bash
gh issue view <ISSUE_NUMBER> --json number,title,body,comments,labels,url
```

- [ ] Confirm local scope before editing:

```bash
git status --short --branch
git diff --stat origin/master...HEAD
```

- [ ] Write or update the failing tests first when behavior changes.
- [ ] Implement the smallest code change that satisfies that issue.
- [ ] Run the narrowest Docker test command for the issue.
- [ ] Run issue-level verification before committing.
- [ ] Commit only that issue's files with a message that references the issue, for example `fix: include source identity in cache keys (#42)`.

## Execution Order

0. Preparation: baseline workflows, smoke script, dependency plan, docs update queue.
1. #42 cache key source identity and version prefix.
2. #47 stricter validation for identifiers and cache TTL.
3. #44 error serialization redaction.
4. #45 complete cache layer API: invalidation, hit/miss logging, keyPrefix, storage decision.
5. #43 NestJS and Next.js adapter cache propagation.
6. #46 documentation and TypeDoc CI.
7. #26 coverage reporting and thresholds.
8. #30 Turborepo orchestration.
9. #32 dual ESM/CJS package exports.
10. #34 CLI and playground.
11. Whole-branch verification, opencode correction loop, PR creation, GitHub CI follow-up.

This order minimizes churn: fix cache correctness first, then widen cache API, then adapter propagation, then docs/CI/infra/package format, then the large DX feature.

---

## Task 0: Preparation and Baseline

**Files:**
- Create: `.context/docs-updates.md`
- Create: `.context/pr-body.md` later, before PR creation.
- Read: `.github/workflows/ci.yml`
- Read: `.github/workflows/changeset.yml`
- Read: `scripts/consumer-smoke.sh`

**Steps:**

- [ ] Read `CLAUDE.md` and all open issue bodies using the mandatory protocol.
- [ ] Read the changeset workflow before deciding between manual changesets and auto-generated changesets:

```bash
sed -n '1,220p' .github/workflows/changeset.yml
```

- [ ] Read CI and smoke scripts:

```bash
sed -n '1,260p' .github/workflows/ci.yml
sed -n '1,260p' scripts/consumer-smoke.sh
sed -n '1,260p' scripts/consumer-smoke.cjs
```

- [ ] Create `.context/docs-updates.md` as the running queue for README/docs changes so repeated issue work does not scatter conflicting documentation edits.
- [ ] Install shared dev dependencies that are already known before feature work starts, inside Docker, in one lockfile mutation:

```bash
docker compose run --rm dev npm install -D @vitest/coverage-v8 turbo
```

- [ ] Do not install CLI runtime dependencies yet; `@nestjs-metrics/cli` does not exist until Task 10.
- [ ] Run current smoke once inside Docker before changing package exports, so later #32 failures have a baseline:

```bash
docker compose run --rm dev npm run smoke
```

- [ ] Commit only if dependency installation changed files:

```bash
git add package.json package-lock.json
git commit -m "chore: prepare issue batch execution"
```

---

## Task 1: Issue #42 - Cache Key Includes Source Identity

**Issue:** #42 "Cache key omits table/FROM — cross-table collisions with the shared default store"

**Files:**
- Modify: `packages/core/src/backend/query-plan.ts`
- Modify: `packages/core/src/backend/executor.backend.ts`
- Modify: `packages/core/src/backend/typeorm.backend.ts`
- Modify: `packages/core/src/metrics.builder.ts`
- Modify: `packages/core/src/cache/cache-key.ts`
- Test: `test/cache.spec.ts`

**Interfaces:**
- Add `source: string` or equivalent source identity to `QueryPlan`.
- `planCacheKey(plan)` must include source identity and return a versioned key such as `mk:v1:<digest>`.
- No public API change.
- The new `mk:v1:` prefix intentionally invalidates previously generated in-memory keys. Record this in docs/changelog/PR notes as a cache namespace migration, not as a data migration.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #42 using the mandatory protocol.
- [ ] Add a regression test in `test/cache.spec.ts` proving two executor-mode builders with identical select/where/params but different `table` or `from` do not share a cached value.
- [ ] Add a unit assertion that a generated key starts with `mk:v1:`.
- [ ] Run the narrow test and confirm it fails:

```bash
docker compose run --rm dev npm test -- test/cache.spec.ts
```

- [ ] Add source identity to `QueryPlan`.
- [ ] Populate it wherever plans are built in `MetricsBuilder.metrics()`, `trends()`, and `metricsWithVariations()` paths.
- [ ] For TypeORM, use stable query source identity from the query builder alias/table expression available in `TypeOrmBackend` or from the builder table name.
- [ ] For executor mode, include the effective `fromSql` or `spec.table` identity so raw `from` fragments cannot collide.
- [ ] Update `planCacheKey` to hash source identity and return `mk:v1:<md5>`.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/cache.spec.ts
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add packages/core/src/backend/query-plan.ts packages/core/src/backend/executor.backend.ts packages/core/src/backend/typeorm.backend.ts packages/core/src/metrics.builder.ts packages/core/src/cache/cache-key.ts test/cache.spec.ts
git commit -m "fix: include source identity in cache keys (#42)"
```

---

## Task 2: Issue #47 - Tighten Zod Validation

**Issue:** #47 "Tighten Zod validation: validate dateColumn/where keys as identifiers; bound cache.ttl"

**Files:**
- Modify: `packages/core/src/options.schema.ts`
- Modify: `test/validation.spec.ts`
- Modify: `test/cache.spec.ts`
- Modify: `README.md` or `docs/GUIA-NESTJS.md` for the SQL injection wording correction.

**Interfaces:**
- `ExecutorSpecSchema.dateColumn` uses the same identifier validation as `table`.
- `ExecutorSpecSchema.where` keys use identifier validation.
- `MetricsOptionsSchema.cache.ttl` is a positive integer.
- `MetricsBuilder.skipValidation` still skips Zod only; the `assertSafeIdentifier`/`qualify` choke point remains active.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #47 using the mandatory protocol.
- [ ] Add validation tests for invalid `dateColumn`, invalid `where` key, `ttl: 0`, `ttl: -1`, `ttl: NaN`, and fractional TTL if TTL is made integer-only.
- [ ] Add a test proving `MetricsBuilder.skipValidation = true` does not disable downstream identifier rejection for unsafe columns.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/validation.spec.ts test/cache.spec.ts
```

- [ ] Change `options.schema.ts` so `dateColumn` and `where` keys use `IdentifierSchema`.
- [ ] Change `cache.ttl` to `z.number().int().positive()` with a clear validation message.
- [ ] Update the existing negative-TTL cache test because negative TTL should now be rejected at schema level, not treated as "already expired" through public options. Keep `MemoryCacheStore`'s direct TTL lifecycle test if it remains useful for the store internals.
- [ ] Add the SQL-injection wording correction to `.context/docs-updates.md` unless the chosen implementation updates docs in this same commit. The final docs must say Zod is defense-in-depth and the real SQL-injection guard for identifiers is `assertSafeIdentifier`/`qualify`.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/validation.spec.ts test/cache.spec.ts test/error-handling.spec.ts
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add packages/core/src/options.schema.ts test/validation.spec.ts test/cache.spec.ts README.md docs/GUIA-NESTJS.md
git commit -m "fix: tighten options validation (#47)"
```

---

## Task 3: Issue #44 - Redact MetricsError Serialization

**Issue:** #44 "MetricsError serializes WHERE params — sensitive values can leak into logs (OWASP A09)"

**Files:**
- Modify: `packages/core/src/exceptions/metrics.error.ts`
- Modify: `packages/core/src/exceptions/query-execution.exception.ts` only if needed for verbose behavior.
- Modify: `test/error-handling.spec.ts`
- Modify: `README.md` or `docs/GUIA-NESTJS.md`

**Interfaces:**
- `error.context` remains available in-process for debugging.
- `JSON.stringify(error)` must not expose raw `context.params` by default.
- `toJSON()` returns a redacted serializable shape: `name`, `message`, `code`, and redacted `context`.
- Verbose context must be explicit and fail-safe. Preferred minimal API: `error.toJSON({ verbose: true })` is not used by `JSON.stringify`, so public docs should recommend direct `error.context` for trusted in-process debugging and JSON serialization for safe logs. If an opt-in global is added, default remains redacted.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #44 using the mandatory protocol.
- [ ] Add a test in `test/error-handling.spec.ts` that builds a `QueryExecutionError` with params like `['secret@example.com', 'token-123']` and asserts `JSON.stringify(error)` contains neither secret value.
- [ ] Add a test that raw params remain available through `error.context?.params`.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/error-handling.spec.ts
```

- [ ] Implement `MetricsError.toJSON()` with recursive context redaction for `params`. Use stable placeholder text such as `"[REDACTED]"`.
- [ ] Optionally truncate very long `query` values only if tests and docs define that behavior; do not silently remove `query` unless necessary.
- [ ] Add safe logging and raw in-process debugging notes to `.context/docs-updates.md` unless the docs are updated in this same commit.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/error-handling.spec.ts
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add packages/core/src/exceptions/metrics.error.ts packages/core/src/exceptions/query-execution.exception.ts test/error-handling.spec.ts README.md docs/GUIA-NESTJS.md
git commit -m "fix: redact metrics error serialization (#44)"
```

---

## Task 4: Issue #45 - Complete Cache Layer Public API

**Issue:** #45 "Complete the caching layer: cache busting, hit/miss logging, missing CacheOptions fields"

**Files:**
- Modify: `packages/core/src/cache/types.ts`
- Modify: `packages/core/src/options.schema.ts`
- Modify: `packages/core/src/cache/cache-key.ts`
- Modify: `packages/core/src/metrics.builder.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `test/cache.spec.ts`
- Modify: `README.md`, `packages/core/README.md`, and/or `docs/ARCHITECTURE.md`

**Interfaces:**
- Extend `CacheOptions` with `keyPrefix?: string` and optional logging hook.
- Recommended logging shape:

```ts
export type CacheEvent = { type: 'hit' | 'miss' | 'set' | 'delete'; key: string };
export type CacheLogger = (event: CacheEvent) => void;
```

- Keep logging off by default.
- Provide documented manual cache busting. Preferred shape: builder method `cacheKey()` for the current plan is hard because plans depend on terminal method. Better public API is explicit terminal invalidation methods:
  - `invalidateMetrics(): Promise<void>`
  - `invalidateTrends(): Promise<void>`
  - or a lower-level `Metrics.cacheKeyFor...` only if it can be stable and documented.
- If invalidation methods execute no query, they must build the same plan and call `cacheStore.del(key)`.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #45 using the mandatory protocol.
- [ ] Decide and document that `storage: 'memory' | 'redis'` will not be added because the already implemented pluggable `CacheStore` is the extension point. Record this in `docs/ARCHITECTURE.md` or `packages/core/README.md`.
- [ ] Add tests for `keyPrefix` changing the cache key namespace.
- [ ] Add tests for hit/miss logging events and that no events fire when logging is absent.
- [ ] Add tests for manual invalidation: cache a query, invalidate it, rerun it, and assert a miss/recompute happens.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/cache.spec.ts
```

- [ ] Extend `CacheOptions` and `MetricsOptionsSchema`.
- [ ] Update `planCacheKey` to accept/use `keyPrefix` while preserving default `mk:v1:` prefix from #42.
- [ ] Refactor `withCache()` to call the logger on hit, miss, set, and delete/invalidate.
- [ ] Implement the chosen invalidation API in `MetricsBuilder`.
- [ ] Export new cache event/logger types from `packages/core/src/index.ts`.
- [ ] Add docs notes for cache configuration, `keyPrefix`, invalidation, logging, pluggable stores, and `mk:v1:` namespace invalidation to `.context/docs-updates.md` unless docs are updated in this same commit.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/cache.spec.ts test/nestjs.spec.ts test/nextjs.spec.ts
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add packages/core/src/cache/types.ts packages/core/src/options.schema.ts packages/core/src/cache/cache-key.ts packages/core/src/metrics.builder.ts packages/core/src/index.ts test/cache.spec.ts README.md packages/core/README.md docs/ARCHITECTURE.md
git commit -m "feat: complete cache control API (#45)"
```

---

## Task 5: Issue #43 - Cache Through NestJS and Next.js Adapters

**Issue:** #43 "NestJS MetricsService drops options.cache — caching unreachable from the adapter"

**Files:**
- Modify: `packages/nestjs-metrics/src/nestjs/tokens.ts`
- Modify: `packages/nestjs-metrics/src/nestjs/metrics.module.ts`
- Modify: `packages/nestjs-metrics/src/nestjs/metrics.service.ts`
- Modify: `packages/nextjs-metrics/src/prisma/index.ts`
- Modify: `packages/nextjs-metrics/src/drizzle/index.ts`
- Modify: `test/nestjs.spec.ts`
- Modify: `test/nextjs.spec.ts` and/or `test/nextjs-drizzle-typed.spec.ts`
- Modify: package READMEs/docs.

**Interfaces:**
- NestJS module options support `cache?: CacheOptions` and `cacheStore?: CacheStore`.
- Precedence: call-site > `forFeature` > `forRoot` > library default.
- `MetricsService.query(qb, options)` signature remains valid; optional third param can be added only if it is non-breaking.
- Prisma/Drizzle adapter functions accept optional `cacheStore?: CacheStore` after `options?: MetricsOptions`, preserving existing calls.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #43 using the mandatory protocol.
- [ ] Add NestJS tests proving `MetricsModule.forRoot({ cache })` enables caching through `MetricsService`.
- [ ] Add NestJS tests proving call-site cache options override feature/root defaults.
- [ ] Add NestJS tests proving a custom cache store can be injected/configured.
- [ ] Add Prisma/Drizzle adapter tests proving a passed `cacheStore` is forwarded to `MetricsBuilder.queryExecutor`.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/nestjs.spec.ts test/nextjs.spec.ts test/nextjs-drizzle-typed.spec.ts
```

- [ ] Update `MetricsModuleOptions` to include `cache` and `cacheStore`, using core types rather than duplicate local types.
- [ ] Update `MetricsModule.forRoot` and `forFeature` validation so the schema accepts cache defaults.
- [ ] Update `MetricsService.query` to merge locale/timezone/cache by precedence and pass the resolved store to `MetricsBuilder.query`.
- [ ] Update Prisma and Drizzle adapters to accept and forward `cacheStore`.
- [ ] Update docs examples.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/nestjs.spec.ts test/nextjs.spec.ts test/nextjs-drizzle-typed.spec.ts test/cache.spec.ts
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add packages/nestjs-metrics/src/nestjs/tokens.ts packages/nestjs-metrics/src/nestjs/metrics.module.ts packages/nestjs-metrics/src/nestjs/metrics.service.ts packages/nextjs-metrics/src/prisma/index.ts packages/nextjs-metrics/src/drizzle/index.ts test/nestjs.spec.ts test/nextjs.spec.ts test/nextjs-drizzle-typed.spec.ts README.md packages/nestjs-metrics/README.md packages/nextjs-metrics/README.md
git commit -m "fix: expose cache through adapters (#43)"
```

---

## Task 6: Issue #46 - Docs Follow-ups and TypeDoc CI

**Issue:** #46 "Docs follow-ups: dead TypeDoc README link, docs:api not in CI, missing error-code reference"

**Files:**
- Modify: `README.md`
- Modify: `docs/GUIA-NESTJS.md`
- Modify: `docs/ARCHITECTURE.md` only if error-code reference belongs there.
- Modify: `typedoc.json`
- Modify: `.github/workflows/ci.yml`
- Optionally create: `docs/ERROR_CODES.md`

**Interfaces:**
- README must not link to missing committed `docs/api/index.html` unless the project publishes it somewhere real.
- `docs:api` must run in CI and fail on TypeDoc warnings.
- Error-code reference table must list every stable code currently thrown.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #46 using the mandatory protocol.
- [ ] Enumerate error codes from source using:

```bash
rg -n "super\\([^,]+, '[A-Z_]+|MISSING_BOUND_PARAMETER|VALIDATION_ERROR|QUERY_EXECUTION_ERROR|CONFIGURATION_ERROR" packages/core/src
```

- [ ] Add or update an error-code reference table with code, thrown by, meaning, typical cause, and suggested fix.
- [ ] Update README API reference link. If no GitHub Pages publishing exists, remove the dead generated-path link and keep local generation instructions.
- [ ] Apply the queued docs changes from `.context/docs-updates.md` that belong in README/docs for #44, #45, #47, and #46.
- [ ] Configure TypeDoc warning failure. Prefer `typedoc.json` options supported by TypeDoc 0.28, then add this step inside the existing `lint-typecheck` job after `npm run typecheck`, so CI reuses the same checkout/install and does not add a second dependency install:

```yaml
- name: Generate API docs
  run: npm run docs:api
```

- [ ] Run:

```bash
docker compose run --rm dev npm run docs:api
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add README.md docs/GUIA-NESTJS.md docs/ARCHITECTURE.md docs/ERROR_CODES.md typedoc.json .github/workflows/ci.yml
git commit -m "docs: fix api docs and error references (#46)"
```

---

## Task 7: Issue #26 - Coverage Reporting and Thresholds

**Issue:** #26 "Add test coverage reporting and thresholds"

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `vitest.config.ts`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Create/modify: focused test files only for uncovered critical behavior that blocks reasonable thresholds.

**Interfaces:**
- Add `test:coverage` and CI coverage reporting.
- Use Vitest V8 coverage provider unless Istanbul is chosen for a specific reason.
- Thresholds should be realistic on the current suite. Do not set aspirational 85% thresholds until measured coverage supports it.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #26 using the mandatory protocol.
- [ ] Confirm the coverage dependency was installed in Task 0. If Task 0 was skipped, install it inside Docker:

```bash
docker compose run --rm dev npm install -D @vitest/coverage-v8
```

- [ ] Add scripts:

```json
"test:coverage": "vitest run --coverage",
"coverage:check": "vitest run --coverage"
```

- [ ] Configure `vitest.config.ts` coverage include/exclude for `packages/*/src/**/*.ts`.
- [ ] Run first measurement:

```bash
docker compose run --rm dev npm run test:coverage
```

- [ ] Set thresholds slightly below measured current coverage so CI enforces no regression. Use per-file thresholds only for files already well covered; do not add brittle thresholds for newly uncovered areas unless tests are added in the same task.
- [ ] Add CI step for coverage. If using Codecov, configure upload only when `CODECOV_TOKEN` is available or use a non-failing upload to avoid breaking forks. Always keep local threshold check as the enforceable gate.
- [ ] Add README badge/instructions only for a real configured service. If no Codecov token/repo setup is confirmed, document `npm run test:coverage` without adding a dead badge.
- [ ] Run:

```bash
docker compose run --rm dev npm run test:coverage
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add package.json package-lock.json vitest.config.ts .github/workflows/ci.yml README.md test
git commit -m "ci: add coverage reporting (#26)"
```

---

## Task 8: Issue #30 - Turborepo Monorepo Orchestration

**Issue:** #30 "Add Turborepo or Nx for better monorepo management"

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `turbo.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md` or `docs/ARCHITECTURE.md`

**Interfaces:**
- Choose Turborepo, not Nx, because the repo is already npm-workspaces-based and small.
- Existing commands remain valid: `npm run build`, `npm test`, `npm run lint`, `npm run typecheck`.
- Add `turbo` orchestration behind those scripts without changing user-facing command names.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #30 using the mandatory protocol.
- [ ] Confirm Turbo was installed in Task 0. If Task 0 was skipped, install it inside Docker:

```bash
docker compose run --rm dev npm install -D turbo
```

- [ ] Create `turbo.json` with tasks for `build`, `test`, `lint`, `typecheck`, `docs:api`, and `test:coverage`. Use `tasks`, not deprecated `pipeline`, for current Turbo versions.
- [ ] Update root scripts so `build`, `test`, `lint`, and `typecheck` run through Turbo where useful while preserving behavior. If root-level tests are not package-scoped, keep `npm test` as Vitest and add `build` through Turbo only; do not force an artificial package split.
- [ ] Ensure package-level `build` scripts remain unchanged.
- [ ] Update CI to benefit from Turbo cache locally. Remote caching should be documented as optional unless Vercel/Turbo credentials are configured.
- [ ] Measure before/after command durations in Docker and record in PR body or docs:

```bash
time docker compose run --rm dev npm run build
time docker compose run --rm dev npm test
```

- [ ] Run:

```bash
docker compose run --rm dev npm run build
docker compose run --rm dev npm test
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run typecheck
```

- [ ] Commit:

```bash
git add package.json package-lock.json turbo.json .github/workflows/ci.yml README.md docs/ARCHITECTURE.md
git commit -m "chore: add turbo orchestration (#30)"
```

---

## Task 9: Issue #32 - Dual ESM/CJS Build

**Issue:** #32 "Modernize package exports with dual ESM/CJS build"

**Files:**
- Modify: `packages/core/tsup.config.ts`
- Modify: `packages/nestjs-metrics/tsup.config.ts`
- Modify: `packages/nextjs-metrics/tsup.config.ts`
- Modify: `packages/core/package.json`
- Modify: `packages/nestjs-metrics/package.json`
- Modify: `packages/nextjs-metrics/package.json`
- Modify: `scripts/consumer-smoke.sh` and/or `scripts/consumer-smoke.cjs`
- Modify/create tests for ESM/CJS and TypeScript module resolution smoke cases.
- Do not delete subpath stub package files unless compatibility is proven.

**Interfaces:**
- Each package should expose both `import` and `require` entries.
- CJS consumers keep working.
- ESM consumers can import package root and subpaths.
- Classic TypeScript `moduleResolution: "node"` continues to resolve subpaths. This conflicts with the issue's "No stub files needed" acceptance criteria and with `CLAUDE.md`; treat `CLAUDE.md` as the stronger project constraint unless tests prove deletion is safe.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #32 using the mandatory protocol.
- [ ] Add smoke tests for:
  - CJS `require('nestjs-metrics')`
  - CJS `require('nestjs-metrics/nestjs')`
  - ESM `import('nestjs-metrics')`
  - ESM `import('nestjs-metrics/nestjs')`
  - TypeScript `moduleResolution: "node"`
  - TypeScript `moduleResolution: "node16"`
  - TypeScript `moduleResolution: "bundler"`
  - `nextjs-metrics/prisma` and `nextjs-metrics/drizzle`
- [ ] Run smoke tests before implementation and capture current behavior.
- [ ] Update tsup configs to output CJS and ESM. Confirm actual output extension names from tsup 8; use package exports that match files on disk.
- [ ] Update package exports with `types`, `import`, `require`, and `default`.
- [ ] Keep physical subpath stubs unless the smoke test proves classic resolver support without them. If kept, document the decision in PR body as "issue acceptance adjusted by CLAUDE.md compatibility rule".
- [ ] Explicitly update `scripts/consumer-smoke.sh` and/or `scripts/consumer-smoke.cjs` so `npm run smoke` validates both CJS and ESM package root/subpath imports plus TypeScript `moduleResolution` modes. The final smoke command must exercise the #32 acceptance criteria, not only the pre-existing smoke coverage.
- [ ] Run:

```bash
docker compose run --rm dev npm run build
docker compose run --rm dev npm run smoke
docker compose run --rm dev npm run typecheck
docker compose run --rm dev npm test
```

- [ ] Record package size comparison before/after using built `dist` sizes:

```bash
docker compose run --rm dev sh -lc "du -sh packages/*/dist"
```

- [ ] Commit:

```bash
git add packages/core/tsup.config.ts packages/nestjs-metrics/tsup.config.ts packages/nextjs-metrics/tsup.config.ts packages/core/package.json packages/nestjs-metrics/package.json packages/nextjs-metrics/package.json scripts test README.md docs
git commit -m "feat: add dual esm cjs builds (#32)"
```

---

## Task 10: Issue #34 - CLI Tool and Playground

**Issue:** #34 "Create CLI tool and playground for better developer experience"

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `packages/cli/package.json`
- Create: `packages/cli/tsconfig.json`
- Create: `packages/cli/tsup.config.ts`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/generate-service.ts`
- Create: `packages/cli/src/commands/generate-dashboard.ts`
- Create: `packages/cli/src/commands/scaffold.ts`
- Create: `packages/cli/src/commands/validate.ts`
- Create: `packages/cli/src/commands/playground.ts`
- Create: `packages/cli/src/templates/ecommerce.ts`
- Create: `packages/cli/src/templates/saas.ts`
- Create: `packages/cli/src/templates/basic.ts`
- Create: `packages/cli/src/playground/server.ts`
- Create: `packages/cli/src/playground/static/*` or a minimal generated HTML app.
- Create: `test/cli.spec.ts`
- Modify: `README.md` and package docs.

**Interfaces:**
- Add workspace package named `@nestjs-metrics/cli`.
- CLI binary name should be `metrics` if available, with package invocation as `npx @nestjs-metrics/cli`.
- Minimum commands for acceptance:
  - `metrics generate service --name OrderMetrics --entity Order`
  - `metrics generate dashboard --name Admin --metrics orders,users,revenue`
  - `metrics scaffold ecommerce`
  - `metrics scaffold saas`
  - `metrics scaffold basic`
  - `metrics validate`
  - `metrics playground`
- Playground should be functional but can be minimal for the first PR: local HTTP server, visual controls, sample dataset, live preview, and code export. Do not add a large frontend framework unless needed.

**Steps:**

- [ ] Read `CLAUDE.md` and issue #34 using the mandatory protocol.
- [ ] Decide CLI dependencies. Prefer small dependencies already compatible with CJS/ESM output. After `packages/cli/package.json` exists and is listed as a workspace, install CLI runtime dependencies inside Docker:

```bash
docker compose run --rm dev npm install -w @nestjs-metrics/cli commander
```

- [ ] Add the new workspace package to root workspaces.
- [ ] Write CLI tests using Vitest that invoke command handlers directly and verify generated file contents in a temp directory.
- [ ] Add tests for all three templates.
- [ ] Add a smoke test for `metrics playground --port 0` starting and shutting down without crashing.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/cli.spec.ts
```

- [ ] Implement command parsing and command handlers.
- [ ] Implement generators with deterministic output and no host-specific paths.
- [ ] Implement `validate` to check for package presence/config shape without requiring a database connection.
- [ ] Implement playground server with static HTML/JS and sample datasets.
- [ ] Add package build config and root build integration.
- [ ] Document CLI usage and playground limits.
- [ ] Run:

```bash
docker compose run --rm dev npm test -- test/cli.spec.ts
docker compose run --rm dev npm run build
docker compose run --rm dev npm run typecheck
docker compose run --rm dev npm run lint
```

- [ ] Commit:

```bash
git add package.json package-lock.json packages/cli test/cli.spec.ts README.md docs
git commit -m "feat: add cli and playground (#34)"
```

---

## Task 11: Changesets and Whole-Branch Verification

**Files:**
- Create: `.changeset/<descriptive-name>.md` unless relying on `.github/workflows/changeset.yml` auto-generation.
- Modify: PR body only after branch push.

**Steps:**

- [ ] Read `.github/workflows/changeset.yml` again and decide whether to rely on the auto-generated changeset workflow or commit a manual changeset. Do not do both unless the auto workflow is disabled or detects the existing changeset and exits cleanly.
- [ ] Add a manual changeset if package code changed and the PR should not rely on the auto changeset workflow. Include all changed packages:

```bash
docker compose run --rm dev npx changeset
```

- [ ] Run full local verification in Docker:

```bash
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run typecheck
docker compose run --rm dev npm test
docker compose run --rm dev npm run test:coverage
docker compose run --rm dev npm run docs:api
docker compose run --rm dev npm run build
docker compose run --rm dev npm run smoke
```

- [ ] Reanalyze all changes manually:

```bash
git diff --stat origin/master...HEAD
git diff origin/master...HEAD -- . ':!package-lock.json'
```

- [ ] Check issue coverage:

```bash
for n in 26 30 32 34 42 43 44 45 46 47; do gh issue view "$n" --json number,title,body,url; done
```

- [ ] Run opencode review/correction loop before PR:

```text
Use mcp__opencode_deepseek.run_opencode_deepseek with:
- cwd: /Users/pedrocardoso/conductor/workspaces/nestjs-metrics/baghdad
- prompt: "Reanalise as mudanças desde origin/master para as issues #26 #30 #32 #34 #42 #43 #44 #45 #46 #47. Primeiro leia CLAUDE.md. Procure gaps de código, testes, docs, package exports, CI/CD GitHub Actions e riscos de PR. Se encontrar problemas, corrija no workspace com mudanças pequenas e rode os testes Docker relevantes. Retorne um resumo dos patches e verificações."
- timeoutSec: 1200
```

- [ ] Inspect opencode changes. Keep useful fixes, adjust manually where needed, and rerun relevant Docker commands.
- [ ] If opencode reports no changes, still run at least `git status --short` and one full verification command group again.
- [ ] Commit opencode/manual corrections as separate commit:

```bash
git add <corrected-files>
git commit -m "chore: address final review gaps"
```

- [ ] Create `.context/pr-body.md` before opening the PR:

```markdown
# Resolve metrics-kit open issue batch

Closes #26
Closes #30
Closes #32
Closes #34
Closes #42
Closes #43
Closes #44
Closes #45
Closes #46
Closes #47

## Summary
- Cache correctness, validation, redaction, cache API, adapter propagation.
- Docs, TypeDoc CI, coverage gates, Turbo orchestration, dual ESM/CJS packaging.
- CLI and playground package.

## Verification
- docker compose run --rm dev npm run lint
- docker compose run --rm dev npm run typecheck
- docker compose run --rm dev npm test
- docker compose run --rm dev npm run test:coverage
- docker compose run --rm dev npm run docs:api
- docker compose run --rm dev npm run build
- docker compose run --rm dev npm run smoke

## Notes
- #32: Document whether physical subpath stubs were retained because `CLAUDE.md` requires classic resolver compatibility.
- #30: Document whether remote Turbo cache is configured or left as optional.
- #26: Document measured coverage baseline and enforced thresholds.
- Cache keys now use `mk:v1:` namespace; this intentionally misses old in-memory keys.
```

---

## Task 12: Open PR and GitHub CI/CD Follow-up

**Steps:**

- [ ] Push current branch:

```bash
git push -u origin HEAD
```

- [ ] Open draft PR against `master`:

```bash
gh pr create --base master --draft --title "Resolve metrics-kit open issue batch" --body-file .context/pr-body.md
```

- [ ] PR body must include:
  - Issues closed: `Closes #26`, `Closes #30`, `Closes #32`, `Closes #34`, `Closes #42`, `Closes #43`, `Closes #44`, `Closes #45`, `Closes #46`, `Closes #47`.
  - Per-issue summary.
  - Tests run, exactly as command output showed.
  - Notes on #32 stub compatibility decision.
  - Notes on #30 remote Turbo cache if not configured.
  - Notes on #26 coverage threshold baseline.

- [ ] Watch CI:

```bash
gh pr checks --watch
```

- [ ] If PR creation, changeset bot, GitHub Actions, release workflow implications, or CI checks fail, immediately run the opencode correction loop with the exact failure logs:

```text
Use mcp__opencode_deepseek.run_opencode_deepseek with:
- cwd: /Users/pedrocardoso/conductor/workspaces/nestjs-metrics/baghdad
- prompt: "Leia CLAUDE.md. O PR para master falhou ou expôs problema de CI/CD. Aqui estão os logs/erros: <paste logs>. Analise causa raiz, corrija no workspace sem desfazer mudanças do usuário, rode os testes Docker relevantes e explique a correção."
- timeoutSec: 1200
```

- [ ] Review opencode patch, rerun verification, commit, push:

```bash
git status --short
docker compose run --rm dev npm run lint
docker compose run --rm dev npm run typecheck
docker compose run --rm dev npm test
git add <fixed-files>
git commit -m "fix: address pr ci feedback"
git push
gh pr checks --watch
```

- [ ] When all checks pass, mark PR ready:

```bash
gh pr ready
```

## Final Self-Review Checklist

- [ ] Every issue was started by rereading `CLAUDE.md`.
- [ ] Every issue has a separate commit or clearly separated commit group.
- [ ] New behavior has tests.
- [ ] Docker commands, not host commands, were used for project verification.
- [ ] `CLAUDE.md` subpath-stub constraint was respected or explicitly justified with tests.
- [ ] CI includes docs and coverage gates without depending on unavailable secrets.
- [ ] PR body lists exact commands run.
- [ ] Any failure or suspicious gap was sent through `run_opencode_deepseek`, reviewed, fixed, and reverified.
