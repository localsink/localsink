import { format } from 'node:util';
import { type IngestPayload } from './types.ts';

export function mapConsoleArgs(
  level: IngestPayload['level'],
  args: unknown[],
  serviceName: string,
): IngestPayload {
  const message = format(...args);

  const errorArg = args.find((a): a is Error => a instanceof Error);
  const error: IngestPayload['error'] = errorArg
    ? {
        message: errorArg.message,
        ...(errorArg.stack !== undefined && { stack: errorArg.stack }),
        type: errorArg.constructor.name,
      }
    : null;

  return {
    service_name: serviceName,
    timestamp: Date.now(),
    level,
    message,
    trace_id: null,
    span_id: null,
    logger: 'console',
    error,
    attributes: null,
  };
}
