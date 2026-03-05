import http from 'node:http';
import { sendLog } from './send.js';
import type { IngestPayload } from './types.js';

const FIXTURE: IngestPayload = {
  service_name: 'test-service',
  timestamp: 1700000000000,
  level: 'info',
  message: 'hello world',
  trace_id: null,
  span_id: null,
  logger: null,
  error: null,
  attributes: null,
};

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

describe('sendLog', () => {
  it('POSTs the payload as JSON to the given endpoint', async () => {
    sendLog(`http://localhost:${String(port)}/api/logs`, FIXTURE);
    await waitFor(() => receivedBodies.length > 0);
    expect(receivedBodies[0]).toEqual(FIXTURE);
  });

  it('sets Content-Type to application/json', async () => {
    let receivedContentType: string | undefined;
    const headerServer = http.createServer((req, res) => {
      receivedContentType = req.headers['content-type'];
      req.resume();
      req.on('end', () => {
        res.writeHead(200);
        res.end();
      });
    });

    await new Promise<void>((resolve) => {
      headerServer.listen(0, resolve);
    });
    const p = (headerServer.address() as { port: number }).port;

    sendLog(`http://localhost:${String(p)}/api/logs`, FIXTURE);
    await waitFor(() => receivedContentType !== undefined);
    expect(receivedContentType).toBe('application/json');

    await new Promise<void>((resolve, reject) => {
      headerServer.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  it('does not throw when the endpoint is unreachable', async () => {
    expect(() => {
      sendLog('http://localhost:1/api/logs', FIXTURE);
    }).not.toThrow();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 500);
    });
  });

  it('does not throw when the server returns 500', async () => {
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
    const p = (errorServer.address() as { port: number }).port;

    expect(() => {
      sendLog(`http://localhost:${String(p)}/api/logs`, FIXTURE);
    }).not.toThrow();

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
});
