import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

export interface WriteFileOptions {
  cwd?: string;
  force?: boolean;
}

export function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

export function pascalCase(value: string): string {
  const words = value.match(/[a-zA-Z0-9]+/g) ?? [];
  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('');
}

export async function writeGeneratedFile(
  relativePath: string,
  content: string,
  options: WriteFileOptions = {},
): Promise<string> {
  const cwd = resolve(options.cwd ?? process.cwd());
  const absolutePath = resolve(cwd, relativePath);
  if (!absolutePath.startsWith(cwd)) {
    throw new Error(`Refusing to write outside the target directory: ${relativePath}`);
  }
  await mkdir(dirname(absolutePath), { recursive: true });
  try {
    await writeFile(absolutePath, content, { flag: options.force ? 'w' : 'wx' });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error(`File already exists: ${relativePath}. Re-run with --force to overwrite.`);
    }
    throw error;
  }
  return absolutePath;
}

export async function readJsonFile<T>(cwd: string, relativePath: string): Promise<T | undefined> {
  try {
    const raw = await readFile(join(cwd, relativePath), 'utf8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}
