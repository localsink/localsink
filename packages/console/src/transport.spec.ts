import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { localsink } from './transport.ts';

function bodyLevel(b: unknown): unknown {
  if (typeof b !== 'object' || b === null) return undefined;
  return Reflect.get(b, 'level');
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('@localsink/console transport', () => {
  it('sends a console.log call to the mock server', async () => {
    const { promise: received, resolve } = Promise.withResolvers<unknown>();
    server.use(
      http.post('http://localhost/api/logs', async ({ request }) => {
        resolve(await request.json());
        return HttpResponse.json({});
      }),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      console.log('hello world');
      expect(await received).toMatchObject({
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
      const { promise: received, resolve } = Promise.withResolvers<unknown>();
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          resolve(await request.json());
          return HttpResponse.json({});
        }),
      );
      const uninstall = localsink({
        serviceName: 'test-service',
        url: 'http://localhost',
      });
      try {
        console[method](`${method} message`);
        expect(await received).toMatchObject({
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
    const bodies: unknown[] = [];
    // Vitest's console.trace internally calls console.error, so multiple
    // bodies may arrive. Resolve once the one with level 'trace' is received.
    const { promise: traceReceived, resolve } = Promise.withResolvers<void>();
    server.use(
      http.post('http://localhost/api/logs', async ({ request }) => {
        const body = await request.json();
        bodies.push(body);
        if (bodyLevel(body) === 'trace') resolve();
        return HttpResponse.json({});
      }),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      console.trace('trace message');
      await traceReceived;
      expect(bodies.find((b) => bodyLevel(b) === 'trace')).toMatchObject({
        service_name: 'test-service',
        level: 'trace',
        message: 'trace message',
      });
    } finally {
      uninstall();
    }
  });

  it('still calls the original console method after install', () => {
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.error()),
    );
    const spy = vi.spyOn(console, 'log');
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      console.log('test message');
      expect(spy).toHaveBeenCalledWith('test message');
    } finally {
      uninstall();
      spy.mockRestore();
    }
  });

  it('stops forwarding after uninstall', async () => {
    let called = false;
    server.use(
      http.post('http://localhost/api/logs', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    uninstall();

    console.log('should not be sent');

    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    expect(called).toBe(false);
  });

  it('does not throw when pointed at a port with nothing listening', () => {
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.error()),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      expect(() => console.log('test')).not.toThrow();
    } finally {
      uninstall();
    }
  });

  it('does not throw when the mock server returns 500', () => {
    server.use(
      http.post(
        'http://localhost/api/logs',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      expect(() => console.log('test')).not.toThrow();
    } finally {
      uninstall();
    }
  });

  it('extracts error details when console.error is called with an Error', async () => {
    const { promise: received, resolve } = Promise.withResolvers<unknown>();
    server.use(
      http.post('http://localhost/api/logs', async ({ request }) => {
        resolve(await request.json());
        return HttpResponse.json({});
      }),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      console.error(new TypeError('boom'));
      expect(await received).toMatchObject({
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
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.json({})),
    );
    const warnSpy = vi.spyOn(console, 'warn');
    const uninstall1 = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const uninstall2 = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    try {
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[localsink]'),
      );
      uninstall2();
      uninstall1();
      const uninstall3 = localsink({
        serviceName: 'test-service',
        url: 'http://localhost',
      });
      uninstall3();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not throw when an argument has a circular reference', () => {
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.error()),
    );
    const uninstall = localsink({
      serviceName: 'test-service',
      url: 'http://localhost',
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
