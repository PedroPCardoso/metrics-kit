import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { readJsonFile } from '../fs';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const runtimePackages = ['nestjs-metrics', 'nextjs-metrics', 'nestjs-metrics-core'];

export async function validateProject(cwd = process.cwd()): Promise<ValidationReport> {
  const root = resolve(cwd);
  const errors: string[] = [];
  const warnings: string[] = [];
  const pkg = await readJsonFile<PackageJson>(root, 'package.json');

  if (!pkg) {
    errors.push('package.json not found.');
  } else {
    const declared = {
      ...pkg.dependencies,
      ...pkg.devDependencies,
      ...pkg.peerDependencies,
    };
    if (!runtimePackages.some((name) => declared[name])) {
      errors.push(`Install one metrics package: ${runtimePackages.join(', ')}.`);
    }
  }

  try {
    await access(join(root, 'tsconfig.json'));
  } catch {
    warnings.push('tsconfig.json not found. TypeScript module resolution smoke checks may not match your app.');
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function formatValidationReport(report: ValidationReport): string {
  const lines = [report.ok ? 'metrics validate: ok' : 'metrics validate: failed'];
  for (const error of report.errors) {
    lines.push(`error: ${error}`);
  }
  for (const warning of report.warnings) {
    lines.push(`warning: ${warning}`);
  }
  return lines.join('\n');
}
