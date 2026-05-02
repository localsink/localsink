import { mapConsoleArgs } from './mapper.ts';
import { type IngestPayload, TransportOptionsSchema } from './types.ts';

export type { TransportOptions } from './types.ts';

type Level = IngestPayload['level'];

let installed = false;

const noop = (): void => {
  // noop
};

export function localsink(opts: unknown): () => void {
  const parsed = TransportOptionsSchema.safeParse(opts);
  if (!parsed.success) {
    console.warn(
      '[localsink] Invalid options — transport disabled.',
      parsed.error.issues,
    );
    return noop;
  }

  if (installed) {
    console.warn('[localsink] Already installed — ignoring duplicate call.');
    return noop;
  }

  const { serviceName, url } = parsed.data;
  const baseUrl = url ?? 'http://localhost:3000';
  const endpoint = new URL('/api/logs', baseUrl).toString();

  function send(level: Level, args: unknown[]): void {
    try {
      const payload = mapConsoleArgs(level, args, serviceName);
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(3000),
      }).catch(() => {
        // localsink being down must never affect the application
      });
    } catch {
      // serialization errors must never surface to the caller
    }
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
