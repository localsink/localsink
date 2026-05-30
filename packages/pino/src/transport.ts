import build from 'pino-abstract-transport';

import { createClient, TransportOptionsSchema } from '@localsink/sdk';

import { mapPinoLog } from './mapper.ts';

export default function (opts: unknown) {
  const client = createClient(TransportOptionsSchema.parse(opts));
  const pending = new Set<Promise<void>>();

  return build(
    async function (source) {
      for await (const obj of source) {
        const payload = mapPinoLog(obj);
        if (!payload) continue;
        const p = client.log(payload);
        pending.add(p);
        void p.finally(() => pending.delete(p));
      }
    },
    {
      async close(_err: Error | undefined) {
        await Promise.allSettled(pending);
      },
    },
  );
}
