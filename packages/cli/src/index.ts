#!/usr/bin/env node
import { Command } from 'commander';
import { generateDashboard, parseMetricsList } from './commands/generate-dashboard';
import { generateService } from './commands/generate-service';
import { runPlaygroundCommand } from './commands/playground';
import { scaffold } from './commands/scaffold';
import { formatValidationReport, validateProject } from './commands/validate';
import { listTemplates } from './templates';

interface CommonCommandOptions {
  cwd?: string;
  force?: boolean;
}

export function buildProgram(): Command {
  const program = new Command();
  program
    .name('metrics')
    .description('Developer CLI for nestjs-metrics')
    .version('0.1.0');

  const generate = program.command('generate').description('Generate metrics code');

  generate
    .command('service')
    .requiredOption('--name <name>', 'Service base name, for example OrderMetrics')
    .requiredOption('--entity <entity>', 'Entity name, for example Order')
    .option('--cwd <dir>', 'Target project directory')
    .option('--force', 'Overwrite existing files')
    .action(async (options: CommonCommandOptions & { name: string; entity: string }) => {
      const result = await generateService(options);
      printFiles('Generated service', result.files);
    });

  generate
    .command('dashboard')
    .requiredOption('--name <name>', 'Dashboard name, for example Admin')
    .requiredOption('--metrics <list>', 'Comma-separated metric names, for example orders,users,revenue')
    .option('--cwd <dir>', 'Target project directory')
    .option('--force', 'Overwrite existing files')
    .action(async (options: CommonCommandOptions & { name: string; metrics: string }) => {
      const result = await generateDashboard({
        ...options,
        metrics: parseMetricsList(options.metrics),
      });
      printFiles('Generated dashboard', result.files);
    });

  const scaffoldCommand = program.command('scaffold').description('Scaffold common metrics templates');
  for (const template of listTemplates()) {
    scaffoldCommand
      .command(template.name)
      .description(template.description)
      .option('--cwd <dir>', 'Target project directory')
      .option('--force', 'Overwrite existing files')
      .action(async (options: CommonCommandOptions) => {
        const result = await scaffold({ ...options, template: template.name });
        printFiles(`Scaffolded ${template.name}`, result.files);
      });
  }

  program
    .command('validate')
    .description('Validate local metrics package setup')
    .option('--cwd <dir>', 'Project directory to validate')
    .action(async (options: { cwd?: string }) => {
      const report = await validateProject(options.cwd);
      console.log(formatValidationReport(report));
      if (!report.ok) {
        process.exitCode = 1;
      }
    });

  program
    .command('playground')
    .description('Start the local metrics playground')
    .option('--host <host>', 'Host to bind', '127.0.0.1')
    .option('--port <port>', 'Port to bind', '3000')
    .option('--once', 'Start and immediately stop; useful for smoke tests')
    .action(async (options: { host?: string; port?: string; once?: boolean }) => {
      const url = await runPlaygroundCommand(options);
      console.log(`Metrics playground listening at ${url}`);
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  await buildProgram().parseAsync(argv);
}

function printFiles(label: string, files: string[]): void {
  console.log(`${label}:`);
  for (const file of files) {
    console.log(`- ${file}`);
  }
}

if (typeof require !== 'undefined' && require.main === module) {
  runCli().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}

export { generateDashboard, parseMetricsList } from './commands/generate-dashboard';
export { generateService } from './commands/generate-service';
export { runPlaygroundCommand } from './commands/playground';
export { scaffold } from './commands/scaffold';
export { formatValidationReport, validateProject } from './commands/validate';
export { startPlayground } from './playground/server';
export { getTemplate, listTemplates } from './templates';
