import Transport from 'winston-transport';
import { mapWinstonLog } from './mapper.js';
import { TransportOptionsSchema } from './types.js';

export type { TransportOptions } from './types.js';

export class LocalsinkTransport extends Transport {
  private readonly serviceName: string;
  private readonly endpoint: string;

  constructor(opts: unknown) {
    super(
      opts instanceof Object
        ? (opts as ConstructorParameters<typeof Transport>[0])
        : undefined,
    );
    const { serviceName, url } = TransportOptionsSchema.parse(opts);
    this.serviceName = serviceName;
    this.endpoint = `${url ?? 'http://localhost:4983'}/api/logs`;
  }

  override log(info: unknown, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });
    callback();

    const payload = mapWinstonLog(
      info as Record<string, unknown>,
      this.serviceName,
    );
    if (!payload) return;

    fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3000),
    }).catch(() => {
      // localsink being down must never affect the application
    });
  }
}
