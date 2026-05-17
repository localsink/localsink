import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import pino from 'pino';

import buildTransport from './transport.ts';

function endTransport(stream: NodeJS.WritableStream): Promise<void> {
  return new Promise<void>((resolve) => {
    stream.once('close', resolve);
    stream.end();
  });
}

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('@localsink/pino transport', () => {
  it('sends a log emitted via pino to the mock server', async () => {
    const received = new Promise<unknown>((resolve) => {
      server.use(
        http.post('http://localhost/api/logs', async ({ request }) => {
          resolve(await request.json());
          return HttpResponse.json({});
        }),
      );
    });
    const transport = buildTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = pino(transport);

    logger.info('hello world');

    expect(await received).toMatchObject({
      service_name: 'test-service',
      level: 'info',
      message: 'hello world',
    });

    await endTransport(transport);
  });

  it('does not throw when pointed at a port with nothing listening', async () => {
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.error()),
    );
    const transport = buildTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = pino(transport);

    expect(() => logger.info('test')).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    await endTransport(transport);
  });

  it('does not throw when the mock server returns 500', async () => {
    server.use(
      http.post(
        'http://localhost/api/logs',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    const transport = buildTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = pino(transport);

    expect(() => logger.info('test')).not.toThrow();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    await endTransport(transport);
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
    const transport = buildTransport({
      serviceName: 'test-service',
      url: 'http://localhost',
    });
    const logger = pino(transport);

    transport.write(
      JSON.stringify({ time: Date.now(), msg: 'bad record' }) + '\n',
    );
    logger.info('still alive');

    expect(await received).toMatchObject({ message: 'still alive' });

    await endTransport(transport);
  });
});
