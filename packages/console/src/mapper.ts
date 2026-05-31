import { format } from 'node:util';

import type { LogInput } from '@localsink/sdk';

export type Level = 'log' | 'error' | 'warn' | 'info' | 'debug' | 'trace';

export function mapConsoleArgs(level: Level, args: unknown[]): LogInput {
  const message = format(...args);

  const errorArg = args.find((a): a is Error => a instanceof Error);
  const error = errorArg
    ? {
        ...Object.fromEntries(Object.entries(errorArg)),
        message: errorArg.message,
        ...(errorArg.stack !== undefined && { stack: errorArg.stack }),
        type: errorArg.constructor.name,
      }
    : undefined;

  return {
    timestamp: Date.now(),
    level,
    message,
    logger: 'console',
    ...(error !== undefined && { error }),
  };
}
