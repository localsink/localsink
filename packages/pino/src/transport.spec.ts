import http from 'node:http';
import pino from 'pino';

type ThreadStream = ReturnType<typeof pino.transport>;

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

function endTransport(transport: ThreadStream): Promise<void> {
  return new Promise<void>((resolve) => {
    transport.once('close', resolve);
    transport.end();
  });
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

describe('@localsink/pino transport', () => {
  it('sends a log emitted via pino to the mock server', async () => {
    const transport = pino.transport({
      target: '@localsink/pino',
      options: {
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      },
    });
    const logger = pino(transport);

    logger.info('hello world');

    await waitFor(() => receivedBodies.length > 0);

    expect(receivedBodies[0]).toMatchObject({
      service_name: 'test-service',
      level: 'info',
      message: 'hello world',
    });

    await endTransport(transport);
  });

  it('does not throw when pointed at a port with nothing listening', async () => {
    const transport = pino.transport({
      target: '@localsink/pino',
      options: { serviceName: 'test-service', url: 'http://localhost:1' },
    });
    const logger = pino(transport);

    // Should not throw — errors are swallowed by the transport
    logger.info('test');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    await endTransport(transport);
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

    const transport = pino.transport({
      target: '@localsink/pino',
      options: {
        serviceName: 'test-service',
        url: `http://localhost:${String(errorPort)}`,
      },
    });
    const logger = pino(transport);

    // Should not throw — non-2xx responses are silently ignored
    logger.info('test');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });

    await endTransport(transport);

    await new Promise<void>((resolve, reject) => {
      errorServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('silently drops records that fail schema validation and continues processing', async () => {
    const transport = pino.transport({
      target: '@localsink/pino',
      options: {
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      },
    });
    const logger = pino(transport);

    // Write a record directly that is missing the required `msg` field —
    // this simulates a custom messageKey or other schema mismatch.
    transport.write(JSON.stringify({ level: 30, time: Date.now() }) + '\n');

    // The transport must survive the bad record and continue processing.
    logger.info('still alive');

    await waitFor(() => receivedBodies.length > 0);

    expect(receivedBodies[0]).toMatchObject({ message: 'still alive' });

    await endTransport(transport);
  });
});
