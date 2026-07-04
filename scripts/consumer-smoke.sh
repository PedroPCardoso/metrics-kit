#!/usr/bin/env bash
# Build, pack, and verify the tarball works in a fresh CommonJS consumer.
set -euo pipefail

ROOT="$(pwd)"
npm run build

TMP="$(mktemp -d)"
CORE_TARBALL="$ROOT/$(npm pack -w nestjs-metrics-core --silent)"
NESTJS_TARBALL="$ROOT/$(npm pack -w nestjs-metrics --silent)"
trap 'rm -rf "$TMP" "$CORE_TARBALL" "$NESTJS_TARBALL"' EXIT

cp "$ROOT/scripts/consumer-smoke.cjs" "$TMP/smoke.cjs"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund \
  "$CORE_TARBALL" "$NESTJS_TARBALL" typeorm better-sqlite3 reflect-metadata @nestjs/common @nestjs/core >/dev/null 2>&1

node smoke.cjs
