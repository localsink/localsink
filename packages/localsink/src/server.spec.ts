import { request } from 'node:http';

import { startServer } from './server.ts';

async function start() {
  const server = await startServer({ port: 0, dbFileName: ':memory:' });
  onTestFinished(server.close);
  return server;
}

/** fetch won't send a Host header that differs from the URL; node:http will. */
function statusWithHost(port: number, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    request(
      { host: '127.0.0.1', port, path: '/api/logs', headers: { host } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      },
    )
      .on('error', reject)
      .end();
  });
}

describe('startServer', () => {
  it('listens on loopback by default', async () => {
    const server = await start();
    expect(server.url).toBe(`http://127.0.0.1:${String(server.port)}`);
  });

  it('rejects requests addressed to any other name', async () => {
    const server = await start();
    await expect(statusWithHost(server.port, 'evil.example')).resolves.toBe(
      403,
    );
  });
});
