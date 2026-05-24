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
      await expect(
        db.findLogs({ limit: 500 }).then((p) => p.data),
      ).resolves.toEqual([
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

  it('persists a minimal log with no error or attributes', async () => {
    const { url, db } = await startTestServer();

    const transport = buildTransport({ serviceName: 'test-service', url });
    const logger = pino(transport);

    logger.info('hello world');

    await endTransport(transport);

    await vi.waitFor(async () => {
      await expect(
        db.findLogs({ limit: 500 }).then((p) => p.data),
      ).resolves.toEqual([
        {
          id: 1,
          service_name: 'test-service',
          timestamp: expect.any(Number),
          level: 'info',
          message: 'hello world',
          trace_id: null,
          span_id: null,
          logger: null,
          error: null,
          attributes: null,
        },
      ]);
    });
  });

  it('round-trips trace_id and span_id into their columns', async () => {
    const { url, db } = await startTestServer();

    const transport = buildTransport({ serviceName: 'test-service', url });
    const logger = pino(transport);

    logger.info(
      { trace_id: 'trace-abc', span_id: 'span-xyz', userId: 1 },
      'hello',
    );

    await endTransport(transport);

    await vi.waitFor(async () => {
      await expect(
        db.findLogs({ limit: 500 }).then((p) => p.data),
      ).resolves.toEqual([
        {
          id: 1,
          service_name: 'test-service',
          timestamp: expect.any(Number),
          level: 'info',
          message: 'hello',
          trace_id: 'trace-abc',
          span_id: 'span-xyz',
          logger: null,
          error: null,
          attributes: { userId: 1 },
        },
      ]);
    });
  });

  it('persists multiple logs from one transport', async () => {
    const { url, db } = await startTestServer();

    const transport = buildTransport({ serviceName: 'test-service', url });
    const logger = pino(transport);

    logger.info('one');
    logger.info('two');

    await endTransport(transport);

    await vi.waitFor(async () => {
      const rows = await db.findLogs({ limit: 500 }).then((p) => p.data);
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.message).toSorted()).toEqual(['one', 'two']);
      expect(
        rows.map((r) => r.id).toSorted((a: number, b: number) => a - b),
      ).toEqual([1, 2]);
    });
  });
});
