import type { IngestPayload } from '@localsink/contract';
import { DEFAULT_URL, TransportOptionsSchema, sendLog } from '@localsink/http';
import type { TransportOptions } from '@localsink/http';

export type LogInput = Omit<IngestPayload, 'service_name'>;

export interface LocalsinkClient {
  log(input: LogInput): Promise<void>;
}

export function createClient(opts: TransportOptions): LocalsinkClient {
  const { serviceName, url } = TransportOptionsSchema.parse(opts);
  const endpoint = new URL('/api/logs', url ?? DEFAULT_URL).toString();

  return {
    log(input: LogInput): Promise<void> {
      return sendLog(endpoint, { ...input, service_name: serviceName });
    },
  };
}
