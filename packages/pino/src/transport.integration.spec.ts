import pino from 'pino';

import { startTestServer } from '@localsink/test-harness';

import buildTransport from './transport.ts';

function endTransport(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise<void>((resolve) => {
    stream.once('close', resolve);
    stream.end();
  });
}

describe('@localsink/pino → server → DB', () => {
  it('persists a pino log through the real server into the DB', async () => {
    const { url, db } = await startTestServer();

    const transport = buildTransport({ serviceName: 'test-service', url });
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
          // pino's built-in err serializer rewrites the plain object —
          // assert only the essence, not the serializer's added keys.
          error: expect.objectContaining({ message: 'kaboom' }),
          attributes: { userId: 7, region: 'us' },
        },
      ]);
    });
  });
});
