import Transport from 'winston-transport';

import { TransportOptionsSchema, createClient } from '@localsink/sdk';
import type { LocalsinkClient, TransportOptions } from '@localsink/sdk';

import { mapWinstonLog } from './mapper.ts';

export type LocalsinkTransportOptions = TransportOptions &
  Transport.TransportStreamOptions;

export class LocalsinkTransport extends Transport {
  private readonly client: LocalsinkClient;
  private readonly pending = new Set<Promise<void>>();

  constructor(opts: LocalsinkTransportOptions) {
    super(typeof opts === 'object' && opts !== null ? opts : undefined);
    this.client = createClient(TransportOptionsSchema.parse(opts));
  }

  override log(info: unknown, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });
    callback();

    const payload = mapWinstonLog(info);
    if (!payload) return;

    const p = this.client.log(payload);
    this.pending.add(p);
    void p.then(() => this.pending.delete(p));
  }

  override close(): void {
    void Promise.all(this.pending).then(() => {
      this.emit('finish');
    });
  }
}
