import type { LogInput } from '@localsink/sdk';

import { PinoLogSchema } from './types.ts';

const LEVEL_MAP: Record<number, string> = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

export function mapPinoLog(obj: unknown): LogInput | null {
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
  const errObj =
    errSrc && Object.keys(errSrc).length > 0 ? { ...errSrc } : null;

  return {
    timestamp: time ?? Date.now(),
    level: LEVEL_MAP[level] ?? String(level),
    message: msg ?? '',
    trace_id: traceId ?? trace_id ?? null,
    span_id: spanId ?? span_id ?? null,
    logger: logger ?? null,
    error: errObj && Object.keys(errObj).length > 0 ? errObj : null,
    attributes: Object.keys(rest).length > 0 ? rest : null,
  };
}
