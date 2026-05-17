import type { LogInput } from '@localsink/sdk';

import { WinstonLogSchema } from './types.ts';

export function mapWinstonLog(obj: unknown): LogInput | null {
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

  const rawTs = timestamp ?? Date.now();
  const parsedTs =
    typeof rawTs === 'string' ? new Date(rawTs).getTime() : rawTs;
  const ts = Number.isNaN(parsedTs) ? Date.now() : parsedTs;

  // err takes precedence over error when both are present
  const errSrc = err ?? error;
  const errObj =
    errSrc && Object.keys(errSrc).length > 0 ? { ...errSrc } : null;

  return {
    timestamp: ts,
    level,
    message,
    trace_id: traceId ?? trace_id ?? null,
    span_id: spanId ?? span_id ?? null,
    logger: logger ?? null,
    error: errObj,
    attributes: Object.keys(rest).length > 0 ? rest : null,
  };
}
