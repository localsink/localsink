import http from 'node:http';

import { createClient } from './client.js';

async function waitFor(
  condition: () => boolean,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`Condition not met within ${String(timeoutMs)}ms`);
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 50);
    });
  }
}

let server: http.Server;
let port: number;
const receivedBodies: unknown[] = [];

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      receivedBodies.push(JSON.parse(body) as unknown);
      res.writeHead(200);
      res.end();
    });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, resolve);
  });

  const addr = server.address();
  if (!addr || typeof addr === 'string')
    throw new Error('Expected TCP address');
  port = addr.port;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((err) => {
      if (err) reject(err);
      else resolve();
    });
  });
});

beforeEach(() => {
  receivedBodies.length = 0;
});

describe('createClient', () => {
  it('throws synchronously when serviceName is empty', () => {
    expect(() => {
      createClient({ serviceName: '' });
    }).toThrow('Too small');
  });

  it('throws synchronously when url is not a valid URL', () => {
    expect(() => {
      createClient({ serviceName: 'svc', url: 'not-a-url' });
    }).toThrow('Invalid URL');
  });

  describe('.log()', () => {
    const baseLog = {
      level: 'info',
      message: 'hello',
      timestamp: Date.now(),
      trace_id: null,
      span_id: null,
      logger: null,
      error: null,
      attributes: null,
    };

    it('sends correct service_name, level, and message', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({ ...baseLog, level: 'info', message: 'hello from sdk' });
      await waitFor(() => receivedBodies.length > 0);
      expect(receivedBodies[0]).toMatchObject({
        service_name: 'test-service',
        level: 'info',
        message: 'hello from sdk',
      });
    });

    it('uses provided timestamp', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({ ...baseLog, timestamp: 1000 });
      await waitFor(() => receivedBodies.length > 0);
      const body = receivedBodies[0];
      if (typeof body !== 'object' || body === null || !('timestamp' in body))
        throw new Error('Expected body with timestamp');
      expect(body.timestamp).toBe(1000);
    });

    it('passes through all payload fields', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({
        level: 'error',
        message: 'something went wrong',
        timestamp: 2000,
        trace_id: 'abc-123',
        span_id: 'def-456',
        logger: 'my-module',
        error: { message: 'boom', type: 'TypeError' },
        attributes: { userId: 'u1' },
      });
      await waitFor(() => receivedBodies.length > 0);
      expect(receivedBodies[0]).toMatchObject({
        trace_id: 'abc-123',
        span_id: 'def-456',
        logger: 'my-module',
        error: { message: 'boom', type: 'TypeError' },
        attributes: { userId: 'u1' },
        timestamp: 2000,
      });
    });

    it('does not throw when the endpoint is unreachable', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: 'http://localhost:1',
      });
      expect(() => {
        client.log({ ...baseLog });
      }).not.toThrow();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    });
  });
});
