import { TransportOptionsSchema, createClient } from '@localsink/sdk';
import type { LocalsinkClient } from '@localsink/sdk';

import { mapConsoleArgs } from './mapper.ts';
import type { Level } from './mapper.ts';

let installed = false;

export function localsink(opts: unknown): () => void {
  const parsed = TransportOptionsSchema.safeParse(opts);
  if (!parsed.success) {
    console.warn(
      '[localsink] Invalid options — transport disabled.',
      parsed.error.issues,
    );
    return () => {};
  }

  if (installed) {
    console.warn('[localsink] Already installed — ignoring duplicate call.');
    return () => {};
  }

  const client: LocalsinkClient = createClient(parsed.data);

  function send(level: Level, args: unknown[]): void {
    client.log(mapConsoleArgs(level, args));
  }

  const orig = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,
    trace: console.trace,
  };

  installed = true;

  console.log = (...args: unknown[]) => {
    orig.log(...args);
    send('log', args);
  };
  console.error = (...args: unknown[]) => {
    orig.error(...args);
    send('error', args);
  };
  console.warn = (...args: unknown[]) => {
    orig.warn(...args);
    send('warn', args);
  };
  console.info = (...args: unknown[]) => {
    orig.info(...args);
    send('info', args);
  };
  console.debug = (...args: unknown[]) => {
    orig.debug(...args);
    send('debug', args);
  };
  console.trace = (...args: unknown[]) => {
    orig.trace(...args);
    send('trace', args);
  };

  return function uninstall(): void {
    console.log = orig.log;
    console.error = orig.error;
    console.warn = orig.warn;
    console.info = orig.info;
    console.debug = orig.debug;
    console.trace = orig.trace;
    installed = false;
  };
}
