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

  const addr = server.address() as { port: number };
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
    }).toThrow();
  });

  it('throws synchronously when url is not a valid URL', () => {
    expect(() => {
      createClient({ serviceName: 'svc', url: 'not-a-url' });
    }).toThrow();
  });

  describe('.log()', () => {
    it('sends correct service_name, level, and message', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({ level: 'info', message: 'hello from sdk' });
      await waitFor(() => receivedBodies.length > 0);
      expect(receivedBodies[0]).toMatchObject({
        service_name: 'test-service',
        level: 'info',
        message: 'hello from sdk',
      });
    });

    it('sets timestamp close to Date.now()', async () => {
      const before = Date.now();
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({ level: 'info', message: 'ts test' });
      const after = Date.now();
      await waitFor(() => receivedBodies.length > 0);
      const body = receivedBodies[0] as { timestamp: number };
      expect(body.timestamp).toBeGreaterThanOrEqual(before);
      expect(body.timestamp).toBeLessThanOrEqual(after);
    });

    it('sends null for absent optional fields', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({ level: 'debug', message: 'optional fields' });
      await waitFor(() => receivedBodies.length > 0);
      expect(receivedBodies[0]).toMatchObject({
        trace_id: null,
        span_id: null,
        logger: null,
        error: null,
        attributes: null,
      });
    });

    it('forwards optional fields when provided', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      client.log({
        level: 'error',
        message: 'something went wrong',
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
      });
    });

    it('does not throw when the endpoint is unreachable', async () => {
      const client = createClient({
        serviceName: 'test-service',
        url: 'http://localhost:1',
      });
      expect(() => {
        client.log({ level: 'info', message: 'test' });
      }).not.toThrow();
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    });
  });
});
