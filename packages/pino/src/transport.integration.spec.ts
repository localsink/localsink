import pino from 'pino';

import { first, pollUntil, startTestServer } from '@localsink/test-harness';
import type { TestServer } from '@localsink/test-harness';

import buildTransport from './transport.ts';

function endTransport(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise<void>((resolve) => {
    stream.once('close', resolve);
    stream.end();
  });
}

describe('@localsink/pino → server → DB', () => {
  let testServer: TestServer;

  beforeEach(async () => {
    testServer = await startTestServer();
  });
  afterEach(async () => {
    await testServer.close();
  });

  it('persists a pino log through the real server into the DB', async () => {
    const transport = buildTransport({
      serviceName: 'test-service',
      url: testServer.url,
    });
    const logger = pino(transport);

    logger.error(
      {
        err: { message: 'kaboom', type: 'Error' },
        userId: 7,
        region: 'us',
      },
      'something failed',
    );

    await endTransport(transport);

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
    expect(row.error).toMatchObject({ message: 'kaboom' });
    expect(row.attributes).toEqual({ userId: 7, region: 'us' });
  });
});
