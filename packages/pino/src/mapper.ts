import { PinoLogSchema, type IngestPayload } from './types.js';

const LEVEL_MAP: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export function mapPinoLog(
  obj: Record<string, unknown>,
  serviceName: string,
): IngestPayload | null {
  const result = PinoLogSchema.safeParse(obj);
  if (!result.success) return null;

  const {
    level,
    time,
    msg,
    pid: _pid,
    hostname: _hostname,
    v: _v,
    traceId,
    trace_id,
    spanId,
    span_id,
    logger,
    err,
    error,
    ...rest
  } = result.data;

  const errSrc = err ?? error;

  return {
    service_name: serviceName,
    timestamp: time,
    level: LEVEL_MAP[level] ?? String(level),
    message: msg,
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
