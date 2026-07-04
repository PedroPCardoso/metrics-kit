import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { get as httpGet } from 'node:http';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  buildProgram,
  generateDashboard,
  generateService,
  runPlaygroundCommand,
  scaffold,
  startPlayground,
  validateProject,
} from '../packages/cli/src';

const tempDirs: string[] = [];

async function tempProject(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'metrics-cli-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('@nestjs-metrics/cli', () => {
  it('generates a Nest metrics service', async () => {
    const cwd = await tempProject();

    const result = await generateService({ cwd, name: 'OrderMetrics', entity: 'Order' });

    expect(result.files).toHaveLength(1);
    const content = await readFile(join(cwd, 'src/order-metrics.service.ts'), 'utf8');
    expect(content).toContain('export class OrderMetricsService');
    expect(content).toContain('forOrder');
    expect(content).toContain("countByMonth('id', 12)");
  });

  it('generates a dashboard snapshot class', async () => {
    const cwd = await tempProject();

    await generateDashboard({ cwd, name: 'Admin', metrics: ['orders', 'users', 'revenue'] });

    const content = await readFile(join(cwd, 'src/admin.dashboard.ts'), 'utf8');
    expect(content).toContain('export class AdminDashboard');
    expect(content).toContain('orders: number;');
    expect(content).toContain('revenue: 0');
  });

  it.each(['basic', 'ecommerce', 'saas'])('scaffolds the %s template', async (template) => {
    const cwd = await tempProject();

    const result = await scaffold({ cwd, template });

    expect(result.files).toHaveLength(1);
    const content = await readFile(result.files[0], 'utf8');
    expect(content).toContain('Metrics');
  });

  it('validates local package setup without a database connection', async () => {
    const cwd = await tempProject();
    await writeFile(
      join(cwd, 'package.json'),
      JSON.stringify({ dependencies: { 'nestjs-metrics': '^1.0.0' } }),
    );

    const report = await validateProject(cwd);

    expect(report.ok).toBe(true);
    expect(report.warnings).toContain('tsconfig.json not found. TypeScript module resolution smoke checks may not match your app.');
  });

  it('reports missing metrics packages during validation', async () => {
    const cwd = await tempProject();
    await writeFile(join(cwd, 'package.json'), JSON.stringify({ dependencies: {} }));

    const report = await validateProject(cwd);

    expect(report.ok).toBe(false);
    expect(report.errors[0]).toContain('Install one metrics package');
  });

  it('starts the playground on an ephemeral port', async () => {
    const handle = await startPlayground({ port: 0 });
    try {
      const html = await new Promise<string>((resolve, reject) => {
        httpGet(handle.url, (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
          });
          res.on('end', () => {
            if (res.statusCode !== 200) reject(new Error(`HTTP ${res.statusCode}`));
            else resolve(body);
          });
        }).on('error', reject);
      });
      expect(html).toContain('NestJS Metrics Playground');
    } finally {
      await handle.close();
    }
  });

  it('supports playground smoke through the command layer', async () => {
    const url = await runPlaygroundCommand({ port: 0, once: true });

    expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/metrics-playground$/);
  });

  it('parses the playground command in the CLI program', async () => {
    const program = buildProgram();
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    program.exitOverride();
    program.configureOutput({ writeOut: () => undefined, writeErr: () => undefined });

    try {
      await expect(program.parseAsync(['node', 'metrics', 'playground', '--port', '0', '--once'])).resolves.toBe(program);
    } finally {
      log.mockRestore();
    }
  });
});
