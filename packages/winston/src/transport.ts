import Transport from 'winston-transport';

import { TransportOptionsSchema, createClient } from '@localsink/sdk';
import type { LocalsinkClient } from '@localsink/sdk';

import { mapWinstonLog } from './mapper.ts';

export class LocalsinkTransport extends Transport {
  private readonly client: LocalsinkClient;

  constructor(opts: unknown) {
    super(
      opts instanceof Object
        ? (opts as ConstructorParameters<typeof Transport>[0])
        : undefined,
    );
    this.client = createClient(TransportOptionsSchema.parse(opts));
  }

  override log(info: unknown, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });
    callback();

    const payload = mapWinstonLog(info);
    if (!payload) return;

    this.client.log(payload);
  }
}
