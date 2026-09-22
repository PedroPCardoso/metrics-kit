import { writeGeneratedFile, type WriteFileOptions } from '../fs';
import { getTemplate, type TemplateName } from '../templates';
import type { GenerateResult } from './generate-service';

export interface ScaffoldOptions extends WriteFileOptions {
  template: TemplateName | string;
}

export async function scaffold(options: ScaffoldOptions): Promise<GenerateResult> {
  const template = getTemplate(options.template);
  const files: string[] = [];

  for (const file of template.files) {
    files.push(await writeGeneratedFile(file.path, file.content, options));
  }

  return { files };
}
