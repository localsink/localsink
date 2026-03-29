import http from 'node:http';
import winston from 'winston';
import { LocalsinkTransport } from './index.js';

let server: http.Server;
let port: number;
const receivedBodies: unknown[] = [];

async function waitFor(
  condition: () => boolean,
  timeoutMs = 8000,
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

describe('@localsink/winston transport', () => {
  it('sends a log emitted via winston to the mock server', async () => {
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.info('hello world');

    await waitFor(() => receivedBodies.length > 0);

    expect(receivedBodies[0]).toMatchObject({
      service_name: 'test-service',
      level: 'info',
      message: 'hello world',
    });
  });

  it('does not throw when pointed at a port with nothing listening', async () => {
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: 'http://localhost:1',
    });
    const logger = winston.createLogger({ transports: [transport] });

    // Should not throw — errors are swallowed by the transport
    logger.info('test');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
  });

  it('does not throw when the mock server returns 500', async () => {
    const errorServer = http.createServer((req, res) => {
      req.resume();
      req.on('end', () => {
        res.writeHead(500);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      errorServer.listen(0, resolve);
    });

    const errorPort = (errorServer.address() as { port: number }).port;

    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: `http://localhost:${String(errorPort)}`,
    });
    const logger = winston.createLogger({ transports: [transport] });

    // Should not throw — non-2xx responses are silently ignored
    logger.info('test');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    await new Promise<void>((resolve, reject) => {
      errorServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('silently drops records that fail schema validation and continues processing', async () => {
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    const logger = winston.createLogger({ transports: [transport] });

    // Call log() directly with a malformed info object (level is a number,
    // not a string) to simulate a schema mismatch without going through Winston.
    transport.log({ level: 42, message: 123 }, () => undefined);

    // Transport must survive the bad record and continue processing.
    logger.info('still alive');

    await waitFor(() => receivedBodies.length > 0);

    expect(receivedBodies[0]).toMatchObject({ message: 'still alive' });
  });
});
