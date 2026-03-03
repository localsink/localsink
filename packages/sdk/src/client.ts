import {
  DEFAULT_URL,
  TransportOptionsSchema,
  sendLog,
  type IngestPayload,
  type TransportOptions,
} from '@localsink/http';

export type { TransportOptions };

export type LogInput = Pick<IngestPayload, 'level' | 'message'> &
  Partial<
    Pick<
      IngestPayload,
      'trace_id' | 'span_id' | 'logger' | 'error' | 'attributes'
    >
  >;

export interface LocalsinkClient {
  log(input: LogInput): void;
}

export function createClient(opts: TransportOptions): LocalsinkClient {
  const { serviceName, url } = TransportOptionsSchema.parse(opts);
  const endpoint = `${url ?? DEFAULT_URL}/api/logs`;

  return {
    log(input: LogInput): void {
      sendLog(endpoint, {
        service_name: serviceName,
        timestamp: Date.now(),
        level: input.level,
        message: input.message,
        trace_id: input.trace_id ?? null,
        span_id: input.span_id ?? null,
        logger: input.logger ?? null,
        error: input.error ?? null,
        attributes: input.attributes ?? null,
      });
    },
  };
}
