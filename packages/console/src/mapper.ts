import { format } from 'node:util';
import { type IngestPayload } from './types.js';

export function mapConsoleArgs(
  level: IngestPayload['level'],
  args: unknown[],
  serviceName: string,
): IngestPayload {
  const message = format(...args);

  const firstArg = args[0];
  const error =
    firstArg instanceof Error
      ? ({
          message: firstArg.message,
          stack: firstArg.stack,
          type: firstArg.constructor.name,
        } as IngestPayload['error'])
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
