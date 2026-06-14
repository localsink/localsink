import { startTestServer } from '@localsink/test-harness';

import { localsink } from './transport.ts';

describe('@localsink/console → server → DB', () => {
  it('persists a console.error call through the real server into the DB', async () => {
    const { url, db } = await startTestServer();

    const uninstall = localsink({ serviceName: 'test-service', url });
    onTestFinished(uninstall);

    console.error(new Error('kaboom'));

    await vi.waitFor(async () => {
      await expect(
        db.findLogs({ limit: 500 }).then((p) => p.data),
      ).resolves.toEqual([
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
          logger: 'console',
          error: null,
          attributes: null,
        },
      ]);
    });
  });

  it('makes error fields full-text searchable end-to-end', async () => {
    const { url, db } = await startTestServer();

    const uninstall = localsink({ serviceName: 'test-service', url });
    onTestFinished(uninstall);

    // A real Error with a distinctive token in its message — the console
    // adapter normalizes the Error into the `error` column, which the trigger
    // then feeds into FTS via json_tree.
    console.error(new Error('uniqueKaboomToken'));

    await vi.waitFor(async () => {
      const rows = await db.findLogs({ limit: 500 }).then((p) => p.data);
      expect(rows).toHaveLength(1);
    });

    // The token appears in both message (util.format(Error)) and error.message,
    // but FTS5's `MATCH` is column-agnostic so a single hit is what we want.
    const { data } = await db.findLogs({ limit: 50, q: 'uniqueKaboomToken' });
    expect(data).toHaveLength(1);

    // Column-scoped search proves the error column was indexed independently.
    const errOnly = await db.findLogs({
      limit: 50,
      q: 'error_text:uniqueKaboomToken',
    });
    expect(errOnly.data).toHaveLength(1);
  });

  it('persists multiple console calls', async () => {
    const { url, db } = await startTestServer();

    const uninstall = localsink({ serviceName: 'test-service', url });
    onTestFinished(uninstall);

    console.log('one');
    console.log('two');

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
