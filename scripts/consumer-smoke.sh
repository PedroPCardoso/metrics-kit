#!/usr/bin/env bash
# Build, pack, and verify the tarball works in a fresh CommonJS consumer.
set -euo pipefail

ROOT="$(pwd)"
npm run build

TMP="$(mktemp -d)"
CORE_TARBALL="$ROOT/$(npm pack -w nestjs-metrics-core --silent)"
NESTJS_TARBALL="$ROOT/$(npm pack -w nestjs-metrics --silent)"
NEXTJS_TARBALL="$ROOT/$(npm pack -w nextjs-metrics --silent)"
trap 'rm -rf "$TMP" "$CORE_TARBALL" "$NESTJS_TARBALL" "$NEXTJS_TARBALL"' EXIT

cp "$ROOT/scripts/consumer-smoke.cjs" "$TMP/smoke.cjs"
cp "$ROOT/scripts/consumer-smoke.mjs" "$TMP/smoke.mjs"
cp "$ROOT/scripts/consumer-smoke-types.ts" "$TMP/smoke-types.ts"
cd "$TMP"
npm init -y >/dev/null 2>&1
npm install --no-audit --no-fund \
  "$CORE_TARBALL" "$NESTJS_TARBALL" "$NEXTJS_TARBALL" \
  typeorm better-sqlite3 reflect-metadata @nestjs/common @nestjs/core \
  drizzle-orm typescript >/dev/null 2>&1

node smoke.cjs
node smoke.mjs

cat > tsconfig.node.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "ignoreDeprecations": "6.0"
  },
  "include": ["smoke-types.ts"]
}
JSON

cat > tsconfig.node16.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "node16",
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true
  },
  "include": ["smoke-types.ts"]
}
JSON

cat > tsconfig.bundler.json <<'JSON'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["smoke-types.ts"]
}
JSON

npx tsc -p tsconfig.node.json --noEmit
npx tsc -p tsconfig.node16.json --noEmit
npx tsc -p tsconfig.bundler.json --noEmit
echo "✓ TypeScript smoke OK — moduleResolution node, node16 and bundler"
