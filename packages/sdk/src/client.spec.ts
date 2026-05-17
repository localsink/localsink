import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import { createClient } from './client.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
      let received: unknown;
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({});
        }),
      );
      const client = createClient({
        serviceName: 'test-service',
        url: 'http://localhost',
      });
      await client.log({
        ...baseLog,
        level: 'info',
        message: 'hello from sdk',
      });
      expect(received).toMatchObject({
        service_name: 'test-service',
        level: 'info',
        message: 'hello from sdk',
      });
    });

    it('uses provided timestamp', async () => {
      let received: unknown;
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({});
        }),
      );
      const client = createClient({
        serviceName: 'test-service',
        url: 'http://localhost',
      });
      await client.log({ ...baseLog, timestamp: 1000 });
      if (
        typeof received !== 'object' ||
        received === null ||
        !('timestamp' in received)
      )
        throw new Error('Expected body with timestamp');
      expect(received.timestamp).toBe(1000);
    });

    it('passes through all payload fields', async () => {
      let received: unknown;
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          received = await request.json();
          return HttpResponse.json({});
        }),
      );
      const client = createClient({
        serviceName: 'test-service',
        url: 'http://localhost',
      });
      await client.log({
        level: 'error',
        message: 'something went wrong',
        timestamp: 2000,
        trace_id: 'abc-123',
        span_id: 'def-456',
        logger: 'my-module',
        error: { message: 'boom', type: 'TypeError' },
        attributes: { userId: 'u1' },
      });
      expect(received).toMatchObject({
        trace_id: 'abc-123',
        span_id: 'def-456',
        logger: 'my-module',
        error: { message: 'boom', type: 'TypeError' },
        attributes: { userId: 'u1' },
        timestamp: 2000,
      });
    });

    it('does not throw when the endpoint is unreachable', async () => {
      server.use(
        http.post('http://localhost/api/logs', () => HttpResponse.error()),
      );
      const client = createClient({
        serviceName: 'test-service',
        url: 'http://localhost',
      });
      await expect(client.log({ ...baseLog })).resolves.toBeUndefined();
    });
  });
});
