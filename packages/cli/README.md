# @nestjs-metrics/cli

[![npm version](https://img.shields.io/npm/v/@nestjs-metrics/cli)](https://www.npmjs.com/package/@nestjs-metrics/cli)
[![npm downloads](https://img.shields.io/npm/dm/@nestjs-metrics/cli)](https://www.npmjs.com/package/@nestjs-metrics/cli)
[![license](https://img.shields.io/npm/l/@nestjs-metrics/cli)](https://github.com/PedroPCardoso/metrics-kit/blob/master/LICENSE)
[![types](https://img.shields.io/npm/types/@nestjs-metrics/cli)](https://www.npmjs.com/package/@nestjs-metrics/cli)
[![CI](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml/badge.svg)](https://github.com/PedroPCardoso/metrics-kit/actions/workflows/ci.yml)

Developer CLI and offline playground for the Metrics Kit packages.

## Installation

```bash
npx @nestjs-metrics/cli <command>
```

Or install globally:

```bash
npm install -g @nestjs-metrics/cli
metrics <command>
```

## Commands

```bash
# Generate a metrics service
metrics generate service --name OrderMetrics --entity Order

# Generate a dashboard scaffold
metrics generate dashboard --name Admin --metrics orders,users,revenue

# Project scaffolds
metrics scaffold ecommerce
metrics scaffold saas
metrics scaffold basic

# Validate project configuration
metrics validate

# Start the offline playground
metrics playground
```

`metrics playground` starts a local HTTP server with sample data, visual controls,
live preview and generated code. It does not connect to your database.

## License

MIT
