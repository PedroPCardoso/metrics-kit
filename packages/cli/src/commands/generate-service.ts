import { kebabCase, pascalCase, writeGeneratedFile, type WriteFileOptions } from '../fs';

export interface GenerateServiceOptions extends WriteFileOptions {
  name: string;
  entity: string;
}

export interface GenerateResult {
  files: string[];
}

export async function generateService(options: GenerateServiceOptions): Promise<GenerateResult> {
  const className = pascalCase(options.name);
  const entityName = pascalCase(options.entity);
  if (!className || !entityName) {
    throw new Error('Both --name and --entity are required.');
  }

  const path = `src/${kebabCase(className)}.service.ts`;
  const content = `import { Injectable } from '@nestjs/common';
import { MetricsService } from 'nestjs-metrics/nestjs';

@Injectable()
export class ${className}Service {
  constructor(private readonly metrics: MetricsService) {}

  for${entityName}(queryBuilder: Parameters<MetricsService['query']>[0]) {
    return this.metrics.query(queryBuilder);
  }

  count${entityName}(queryBuilder: Parameters<MetricsService['query']>[0]) {
    return this.for${entityName}(queryBuilder).count().metrics();
  }

  ${kebabCase(entityName).replace(/-/g, '')}ByMonth(queryBuilder: Parameters<MetricsService['query']>[0]) {
    return this.for${entityName}(queryBuilder)
      .countByMonth('id', 12)
      .fillMissingData()
      .trends();
  }
}
`;

  return {
    files: [await writeGeneratedFile(path, content, options)],
  };
}
