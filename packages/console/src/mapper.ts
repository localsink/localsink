import { format } from 'node:util';
import { type IngestPayload } from './types.ts';

export function mapConsoleArgs(
  level: IngestPayload['level'],
  args: unknown[],
  serviceName: string,
): IngestPayload {
  const message = format(...args);

  const firstArg = args[0];
  const error: IngestPayload['error'] =
    firstArg instanceof Error
      ? {
          message: firstArg.message,
          ...(firstArg.stack !== undefined && { stack: firstArg.stack }),
          type: firstArg.constructor.name,
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
