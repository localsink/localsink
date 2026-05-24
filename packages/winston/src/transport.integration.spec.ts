import winston from 'winston';

import { startTestServer } from '@localsink/test-harness';

import { LocalsinkTransport } from './index.ts';

describe('@localsink/winston → server → DB', () => {
  it('persists a winston log through the real server into the DB', async () => {
    const { url, db } = await startTestServer();

    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url,
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.error('something failed', {
      err: { message: 'kaboom', type: 'Error' },
      userId: 7,
      region: 'us',
    });

    const finished = new Promise<void>((resolve) => {
      transport.once('finish', resolve);
    });
    transport.close();
    await finished;

    await vi.waitFor(async () => {
      expect(await db.findAllLogs()).toEqual([
        {
          id: 1,
          service_name: 'test-service',
          timestamp: expect.any(Number),
          level: 'error',
          message: 'something failed',
          trace_id: null,
          span_id: null,
          logger: null,
          error: { message: 'kaboom', type: 'Error' },
          attributes: { userId: 7, region: 'us' },
        },
      ]);
    });
  });
});
