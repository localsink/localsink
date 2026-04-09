import http from 'node:http';
import { localsink } from './index.js';

let server: http.Server;
let port: number;
const receivedBodies: unknown[] = [];

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

describe('@localsink/console transport', () => {
  it('sends a console.log call to the mock server', async () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    try {
      console.log('hello world');
      await waitFor(() => receivedBodies.length > 0);
      expect(receivedBodies[0]).toMatchObject({
        service_name: 'test-service',
        level: 'log',
        message: 'hello world',
        logger: 'console',
      });
    } finally {
      uninstall();
    }
  });

  it.each(['warn', 'info', 'debug'] as const)(
    'sends a console.%s call to the mock server',
    async (method) => {
      const uninstall = localsink({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      try {
        console[method](`${method} message`);
        await waitFor(() => receivedBodies.length > 0);
        expect(receivedBodies[0]).toMatchObject({
          service_name: 'test-service',
          level: method,
          message: `${method} message`,
        });
      } finally {
        uninstall();
      }
    },
  );

  it('sends a console.trace call to the mock server', async () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    try {
      console.trace('trace message');
      // Vitest's console.trace internally calls console.error, so multiple
      // bodies may arrive. Wait for the one with level 'trace' specifically.
      await waitFor(() =>
        receivedBodies.some(
          (b) => (b as Record<string, unknown>)['level'] === 'trace',
        ),
      );
      const traceBody = receivedBodies.find(
        (b) => (b as Record<string, unknown>)['level'] === 'trace',
      );
      expect(traceBody).toMatchObject({
        service_name: 'test-service',
        level: 'trace',
        message: 'trace message',
      });
    } finally {
      uninstall();
    }
  });

  it('still calls the original console method after install', () => {
    const spy = vi.spyOn(console, 'log');

    // Use a port that rejects immediately so no request reaches the shared
    // mock server and pollutes receivedBodies for subsequent tests.
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost:1',
    });
    try {
      console.log('test message');
      // localsink captures the spy as "orig.log", so the spy is called
      // when our patched version delegates to the original.
      expect(spy).toHaveBeenCalledWith('test message');
    } finally {
      uninstall();
    }
  });

  it('stops forwarding after uninstall', async () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    uninstall();

    console.log('should not be sent');

    await new Promise<void>((resolve) => {
      setTimeout(resolve, 300);
    });

    expect(receivedBodies).toHaveLength(0);
  });

  it('does not throw when pointed at a port with nothing listening', async () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost:1',
    });
    try {
      console.log('test');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    } finally {
      uninstall();
    }
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
    const uninstall = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(errorPort)}`,
    });

    try {
      console.log('test');
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 500);
      });
    } finally {
      uninstall();
      await new Promise<void>((resolve, reject) => {
        errorServer.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  });

  it('extracts error details when console.error is called with an Error', async () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    try {
      console.error(new TypeError('boom'));
      await waitFor(() => receivedBodies.length > 0);
      expect(receivedBodies[0]).toMatchObject({
        level: 'error',
        error: { message: 'boom', type: 'TypeError' },
      });
    } finally {
      uninstall();
    }
  });

  it('returns a no-op and does not throw when options are invalid', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const uninstall = localsink({ serviceName: '' });
    expect(typeof uninstall).toBe('function');
    expect(() => {
      uninstall();
    }).not.toThrow();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[localsink]'),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it('ignores a duplicate install and returns a no-op', () => {
    const warnSpy = vi.spyOn(console, 'warn');
    const uninstall1 = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    const uninstall2 = localsink({
      serviceName: 'test-service',
      url: `http://localhost:${String(port)}`,
    });
    try {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[localsink]'),
      );
      // uninstall2 is a no-op; uninstall1 should still work
      uninstall2();
      uninstall1();
      // After proper uninstall, a fresh install should succeed
      const uninstall3 = localsink({
        serviceName: 'test-service',
        url: `http://localhost:${String(port)}`,
      });
      uninstall3();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not throw when an argument has a circular reference', () => {
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost:1',
    });
    try {
      const circular: Record<string, unknown> = {};
      circular['self'] = circular;
      expect(() => {
        console.log(circular);
      }).not.toThrow();
    } finally {
      uninstall();
    }
  });
});
