import build from 'pino-abstract-transport';
import { mapPinoLog } from './mapper.js';
import { TransportOptionsSchema, type TransportOptions } from './types.js';

export type { TransportOptions } from './types.js';

export default function (opts: TransportOptions) {
  const { serviceName, url } = TransportOptionsSchema.parse(opts);
  const endpoint = `${url ?? 'http://localhost:4983'}/api/logs`;

  return build(async function (source) {
    for await (const obj of source) {
      try {
        const payload = mapPinoLog(obj as Record<string, unknown>, serviceName);
        if (!payload) continue;
        await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(3000),
        });
      } catch {
        // malformed records and network errors must never affect the application
      }
    }
  });
}
