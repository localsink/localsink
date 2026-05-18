import winston from 'winston';

import { first, pollUntil, startTestServer } from '@localsink/test-harness';
import type { TestServer } from '@localsink/test-harness';

import { LocalsinkTransport } from './index.ts';

describe('@localsink/winston → server → DB', () => {
  let testServer: TestServer;

  beforeEach(async () => {
    testServer = await startTestServer();
  });
  afterEach(async () => {
    await testServer.close();
  });

  it('persists a winston log through the real server into the DB', async () => {
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: testServer.url,
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

    const rows = await pollUntil(
      () => testServer.db.findAllLogs(),
      (r) => r.length === 1,
    );

    expect(rows).toHaveLength(1);
    const row = first(rows);
    expect(row).toMatchObject({
      service_name: 'test-service',
      level: 'error',
      message: 'something failed',
    });
    expect(typeof row.timestamp).toBe('number');
    expect(row.error).toMatchObject({ message: 'kaboom', type: 'Error' });
    expect(row.attributes).toEqual({ userId: 7, region: 'us' });
  });
});
