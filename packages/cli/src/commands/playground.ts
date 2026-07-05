import { startPlayground } from '../playground/server';

export interface PlaygroundCommandOptions {
  host?: string;
  port?: string | number;
  once?: boolean;
}

export async function runPlaygroundCommand(options: PlaygroundCommandOptions = {}): Promise<string> {
  const handle = await startPlayground({
    host: options.host,
    port: options.port === undefined ? undefined : Number(options.port),
  });
  if (options.once) {
    await handle.close();
  }
  return handle.url;
}
