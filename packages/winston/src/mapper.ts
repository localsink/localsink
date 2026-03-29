import { WinstonLogSchema, type IngestPayload } from './types.js';

export function mapWinstonLog(
  obj: Record<string, unknown>,
  serviceName: string,
): IngestPayload | null {
  const result = WinstonLogSchema.safeParse(obj);
  if (!result.success) return null;

  const {
    level,
    message,
    timestamp,
    traceId,
    trace_id,
    spanId,
    span_id,
    logger,
    err,
    error,
    ...rest
  } = result.data;

  const ts =
    timestamp === undefined
      ? Date.now()
      : typeof timestamp === 'string'
        ? new Date(timestamp).getTime()
        : timestamp;

  const errSrc = err ?? error;

  return {
    service_name: serviceName,
    timestamp: ts,
    level,
    message,
    trace_id: traceId ?? trace_id ?? null,
    span_id: spanId ?? span_id ?? null,
    logger: logger ?? null,
    error: errSrc
      ? ({
          message: errSrc.message,
          stack: errSrc.stack,
          type: errSrc.type,
        } as IngestPayload['error'])
      : null,
    attributes: Object.keys(rest).length > 0 ? rest : null,
  };
}
