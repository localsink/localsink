import { DEFAULT_URL, TransportOptionsSchema, sendLog } from '@localsink/http';
import type { IngestPayload, TransportOptions } from '@localsink/http';

export type LogInput = Omit<IngestPayload, 'service_name'>;

export interface LocalsinkClient {
  log(input: LogInput): void;
}

export function createClient(opts: TransportOptions): LocalsinkClient {
  const { serviceName, url } = TransportOptionsSchema.parse(opts);
  const endpoint = new URL('/api/logs', url ?? DEFAULT_URL).toString();

  return {
    log(input: LogInput): void {
      sendLog(endpoint, { ...input, service_name: serviceName });
    },
  };
}
