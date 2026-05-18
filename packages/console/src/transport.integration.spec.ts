import { first, pollUntil, startTestServer } from '@localsink/test-harness';
import type { TestServer } from '@localsink/test-harness';

import { localsink } from './transport.ts';

describe('@localsink/console → server → DB', () => {
  let testServer: TestServer;

  beforeEach(async () => {
    testServer = await startTestServer();
  });
  afterEach(async () => {
    await testServer.close();
  });

  it('persists a console.error call through the real server into the DB', async () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: testServer.url,
    });

    try {
      console.error(new Error('kaboom'));
    } finally {
      uninstall();
    }

    const rows = await pollUntil(
      () => testServer.db.findAllLogs(),
      (r) => r.length === 1,
    );

    expect(rows).toHaveLength(1);
    const row = first(rows);
    expect(row).toMatchObject({
      service_name: 'test-service',
      level: 'error',
      logger: 'console',
    });
    expect(typeof row.timestamp).toBe('number');
    expect(typeof row.message).toBe('string');
    expect(row.message).toContain('kaboom');
    expect(row.error).toMatchObject({ message: 'kaboom', type: 'Error' });
  });
});
