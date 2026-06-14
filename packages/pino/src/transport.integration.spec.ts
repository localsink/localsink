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

  it('makes error and attribute fields full-text searchable end-to-end', async () => {
    const { url, db } = await startTestServer();

    const transport = buildTransport({ serviceName: 'test-service', url });
    const logger = pino(transport);

    logger.error(
      {
        err: { message: 'distinctiveErrorToken' },
        userId: 7,
        region: 'us-east',
      },
      'something failed',
    );

    await endTransport(transport);

    // pino's err serializer reshapes the payload at the SDK boundary, so we
    // wait for ingest, then exercise q against the columns the trigger filled.
    await vi.waitFor(async () => {
      const rows = await db.findLogs({ limit: 500 }).then((p) => p.data);
      expect(rows).toHaveLength(1);
    });

    // FTS5's default tokenizer splits on hyphens, so a stored "us-east" is
    // indexed as two tokens ("us", "east") — query either standalone, or use
    // a quoted phrase "us-east" for an exact match.
    for (const q of ['distinctiveErrorToken', 'region', 'east', '7']) {
      const { data } = await db.findLogs({ limit: 50, q });
      expect(data, `expected hit for q=${q}`).toHaveLength(1);
    }
  });

  it('preserves mixed-type attributes through FTS end-to-end', async () => {
    const { url, db } = await startTestServer();

    const transport = buildTransport({ serviceName: 'test-service', url });
    const logger = pino(transport);

    // Mixed JSON shapes pinned to a single log so we can assert every shape
    // round-trips through pino's serializer → server → trigger → FTS.
    logger.info(
      {
        active: true,
        retryable: false,
        count: 42,
        user: { name: 'aliceUnique' },
        tags: ['priorityUnique', 'urgentUnique'],
      },
      'mixed types',
    );

    await endTransport(transport);

    await vi.waitFor(async () => {
      const rows = await db.findLogs({ limit: 500 }).then((p) => p.data);
      expect(rows).toHaveLength(1);
    });

    for (const q of [
      'active',
      'true',
      'false',
      '42',
      'aliceUnique',
      'priorityUnique',
      'urgentUnique',
    ]) {
      const { data } = await db.findLogs({ limit: 50, q });
      expect(data, `expected hit for q=${q}`).toHaveLength(1);
    }
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
