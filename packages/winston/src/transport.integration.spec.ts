import winston from 'winston';

import { startTestServer } from '@localsink/test-harness';

import { LocalsinkTransport } from './index.ts';

async function flushTransport(transport: LocalsinkTransport): Promise<void> {
  const finished = new Promise<void>((resolve) => {
    transport.once('finish', resolve);
  });
  transport.close();
  await finished;
}

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

    await flushTransport(transport);

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

  it('persists a minimal log with no error or attributes', async () => {
    const { url, db } = await startTestServer();

    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url,
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.info('hello world');

    await flushTransport(transport);

    await vi.waitFor(async () => {
      expect(await db.findAllLogs()).toEqual([
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

    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url,
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.info('hello', {
      trace_id: 'trace-abc',
      span_id: 'span-xyz',
      userId: 1,
    });

    await flushTransport(transport);

    await vi.waitFor(async () => {
      expect(await db.findAllLogs()).toEqual([
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

    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url,
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.info('one');
    logger.info('two');

    await flushTransport(transport);

    await vi.waitFor(async () => {
      const rows = await db.findAllLogs();
      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.message).toSorted()).toEqual(['one', 'two']);
      expect(
        rows.map((r) => r.id).toSorted((a: number, b: number) => a - b),
      ).toEqual([1, 2]);
    });
  });
});
