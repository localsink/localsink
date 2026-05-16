import build from 'pino-abstract-transport';

import { createClient, TransportOptionsSchema } from '@localsink/sdk';

import { mapPinoLog } from './mapper.ts';

export default function (opts: unknown) {
  const client = createClient(TransportOptionsSchema.parse(opts));

  return build(async function (source) {
    for await (const obj of source) {
      const payload = mapPinoLog(obj);
      if (!payload) continue;
      client.log(payload);
    }
  });
}
