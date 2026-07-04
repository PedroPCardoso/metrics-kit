import { kebabCase, pascalCase, writeGeneratedFile, type WriteFileOptions } from '../fs';
import type { GenerateResult } from './generate-service';

export interface GenerateDashboardOptions extends WriteFileOptions {
  name: string;
  metrics: string[];
}

export async function generateDashboard(options: GenerateDashboardOptions): Promise<GenerateResult> {
  const className = `${pascalCase(options.name)}Dashboard`;
  const metrics = options.metrics.map((metric) => kebabCase(metric).replace(/-/g, '')).filter(Boolean);
  if (!className || metrics.length === 0) {
    throw new Error('--name and at least one --metrics value are required.');
  }

  const path = `src/${kebabCase(options.name)}.dashboard.ts`;
  const properties = metrics.map((metric) => `  ${metric}: number;`).join('\n');
  const defaults = metrics.map((metric) => `      ${metric}: 0,`).join('\n');
  const content = `export interface ${className}Snapshot {
${properties}
}

export class ${className} {
  async snapshot(): Promise<${className}Snapshot> {
    return {
${defaults}
    };
  }
}
`;

  return {
    files: [await writeGeneratedFile(path, content, options)],
  };
}

export function parseMetricsList(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}
