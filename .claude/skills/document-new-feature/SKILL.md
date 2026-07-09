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

The readme.io site (English) mirrors `docs/GUIA-NESTJS.md`. When updating the local NestJS guide, also sync the `metrics-kit-docs` repo (see step 4).

### 3. Update the chosen doc(s)

- **New fluent methods**: add a usage example after the existing ones, grouped by category (aggregate, period, modifier).
- **New options/parameters**: document the parameter, its type, default value, and behaviour.
- **New error classes**: add to the error hierarchy section with an example.
- **New adapters**: add a new section explaining the adapter and linking to its package.

Follow the existing doc style — code blocks with TypeScript, live examples, and short explanations.

### 4. Sync to metrics-kit-docs (after merging)

The readme.io English site is driven by the **`PedroPCardoso/metrics-kit-docs`** GitHub repo, branch `v1.0`. The file to update is:

```
docs/Getting Started/getting-started.md
```

That file is a direct mirror of `docs/GUIA-NESTJS.md` with a readme.io frontmatter block prepended and the H1 heading stripped (it goes into `title:`):

```yaml
---
title: Complete Guide — nestjs-metrics
excerpt: >-
  Generate metrics and trends from TypeORM entities, with a fluent API and
  NestJS integration.
hidden: false
---
```

**How to sync** (after the metrics-kit PR is merged):

1. Read the updated `docs/GUIA-NESTJS.md`.
2. Strip the first line (`# Complete Guide — nestjs-metrics`) and the blank line after it.
3. Prepend the frontmatter block above.
4. Get the current SHA of the file:
   ```bash
   gh api "repos/PedroPCardoso/metrics-kit-docs/contents/docs/Getting%20Started/getting-started.md?ref=v1.0" | python3 -c "import json,sys; print(json.load(sys.stdin)['sha'])"
   ```
5. Push the new content via the GitHub API:
   ```python
   import base64, json, subprocess
   with open('docs/GUIA-NESTJS.md') as f:
       content = f.read()
   body = '\n'.join(content.split('\n')[2:])
   frontmatter = "---\ntitle: Complete Guide — nestjs-metrics\nexcerpt: >-\n  Generate metrics and trends from TypeORM entities, with a fluent API and\n  NestJS integration.\nhidden: false\n---\n"
   encoded = base64.b64encode((frontmatter + body).encode()).decode()
   payload = json.dumps({"message": "docs: sync with metrics-kit", "content": encoded, "sha": "<current_sha>", "branch": "v1.0"})
   subprocess.run(['gh', 'api', '--method', 'PUT', 'repos/PedroPCardoso/metrics-kit-docs/contents/docs/Getting%20Started/getting-started.md', '--input', '-'], input=payload, text=True)
   ```

## Completion criteria

- Every new or changed public API item has a corresponding entry in the local docs.
- The codebase's `docs/` directory is committed with the feature.
- `PedroPCardoso/metrics-kit-docs` branch `v1.0` is updated to mirror the new `docs/GUIA-NESTJS.md`.
