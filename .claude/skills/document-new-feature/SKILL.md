---
name: document-new-feature
description: When implementing a new feature, also update the docs (local `docs/` files and/or the readme.io site). Use when working on new functionality, adding methods, changing the public API, or when a different skill hands off doc work.
---

## What this is

Every new feature, public API addition, or behavioural change in this repo should be reflected in both **local documentation** (`docs/` files in the repo) and the **readme.io** hosted site (https://nestjs-metrics.readme.io).

The two live side by side — `docs/GUIA-NESTJS.md` (Portuguese) is the canonical NestJS guide, and the readme.io English site tracks it. When one changes, the other is flagged for sync.

## Steps

### 1. Understand what changed

Read the diff or the PR to identify:

- New public methods or classes on the `MetricsBuilder` fluent API
- New options, modifiers (`forYear`, `fillMissingData`, `labelColumn`, etc.)
- New executor modes or repository helpers
- Changes to types, error classes, or the module registration API (`MetricsModule.forRoot`)
- Any behavioural change visible to a consumer

### 2. Map the change to the right doc

The repo has three local doc files, plus the external readme.io site:

| Doc file | What it covers | Update when… |
|---|---|---|
| `docs/GUIA-NESTJS.md` | Full NestJS usage — installation, module, MetricsService, aggregates, periods, windows, ranges, shorthands, fillMissingData, groupData, timezone, locale, cache, executor, filters, errors, helpers | Adding or changing anything in the NestJS adapter or the core fluent API |
| `docs/ARCHITECTURE.md` | Internal architecture — component layers, folder structure, design decisions, portability | Adding new internals, changing the engine, adding a new adapter (e.g. Prisma, Drizzle) |
| `docs/RELEASING.md` | Release workflow — two-branch model, how to publish | Changing the release process, CI/CD, or changeset configuration |

The readme.io site (English) mirrors `docs/GUIA-NESTJS.md`. When updating the local NestJS guide, also flag that readme.io needs a sync.

### 3. Update the chosen doc(s)

- **New fluent methods**: add a usage example after the existing ones, grouped by category (aggregate, period, modifier).
- **New options/parameters**: document the parameter, its type, default value, and behaviour.
- **New error classes**: add to the error hierarchy section with an example.
- **New adapters**: add a new section explaining the adapter and linking to its package.

Follow the existing doc style — code blocks with TypeScript, live examples, and short explanations.

### 4. Sync to readme.io (manual)

The readme.io site is updated outside of CI. After merging, create a note in the PR or an issue to sync the readme.io English docs to match the updated `docs/GUIA-NESTJS.md`.

## Completion criteria

- Every new or changed public API item has a corresponding entry in the local docs.
- The codebase's `docs/` directory is committed with the feature.
- A sync flag (comment in PR or follow-up issue) is raised for readme.io if needed.
