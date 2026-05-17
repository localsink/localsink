import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import winston from 'winston';

import { LocalsinkTransport } from './index.ts';

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('@localsink/winston transport', () => {
  it('sends a log emitted via winston to the mock server', async () => {
    const received = new Promise<unknown>((resolve) => {
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          resolve(await request.json());
          return HttpResponse.json({});
        }),
      );
    });
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.info('hello world');

    expect(await received).toMatchObject({
      service_name: 'test-service',
      level: 'info',
      message: 'hello world',
    });
  });

  it('does not throw when pointed at a port with nothing listening', async () => {
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.error()),
    );
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = winston.createLogger({ transports: [transport] });

    expect(() => logger.info('test')).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('does not throw when the mock server returns 500', async () => {
    server.use(
      http.post(
        'http://localhost/api/logs',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = winston.createLogger({ transports: [transport] });

    expect(() => logger.info('test')).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  });

  it('silently drops records that fail schema validation and continues processing', async () => {
    const received = new Promise<unknown>((resolve) => {
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          resolve(await request.json());
          return HttpResponse.json({});
        }),
      );
    });
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = winston.createLogger({ transports: [transport] });

    transport.log({ level: 42, message: 123 }, () => undefined);
    logger.info('still alive');

    expect(await received).toMatchObject({ message: 'still alive' });
  });

  it('emits finish after close() drains in-flight logs', async () => {
    let received: unknown;
    server.use(
      http.post('http://localhost/api/logs', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({});
      }),
    );
    const transport = new LocalsinkTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = winston.createLogger({ transports: [transport] });

    logger.info('before close');

    const finished = new Promise<void>((resolve) => {
      transport.once('finish', resolve);
    });

    transport.close();
    await finished;

    expect(received).toMatchObject({ message: 'before close' });
  });
});
