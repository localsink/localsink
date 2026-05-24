import { startTestServer } from '@localsink/test-harness';

import { localsink } from './transport.ts';

describe('@localsink/console → server → DB', () => {
  it('persists a console.error call through the real server into the DB', async () => {
    const { url, db } = await startTestServer();

    const uninstall = localsink({ serviceName: 'test-service', url });
    onTestFinished(uninstall);

    console.error(new Error('kaboom'));

    await vi.waitFor(async () => {
      await expect(db.findAllLogs()).resolves.toEqual([
        {
          id: 1,
          service_name: 'test-service',
          timestamp: expect.any(Number),
          level: 'error',
          // console mapper runs util.format on args → message is the formatted
          // Error string ("Error: kaboom\n    at ...").
          message: expect.stringContaining('kaboom'),
          trace_id: null,
          span_id: null,
          logger: 'console',
          // real Error has a dynamic stack — assert only the stable fields.
          error: expect.objectContaining({ message: 'kaboom', type: 'Error' }),
          attributes: null,
        },
      ]);
    });
  });

  it('persists a minimal console.info call', async () => {
    const { url, db } = await startTestServer();

    const uninstall = localsink({ serviceName: 'test-service', url });
    onTestFinished(uninstall);

    console.info('hello world');

    await vi.waitFor(async () => {
      await expect(db.findAllLogs()).resolves.toEqual([
        {
          id: 1,
          service_name: 'test-service',
          timestamp: expect.any(Number),
          level: 'info',
          message: 'hello world',
          trace_id: null,
          span_id: null,
          logger: 'console',
          error: null,
          attributes: null,
        },
      ]);
    });
  });

  it('persists multiple console calls', async () => {
    const { url, db } = await startTestServer();

    const uninstall = localsink({ serviceName: 'test-service', url });
    onTestFinished(uninstall);

    console.log('one');
    console.log('two');

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
