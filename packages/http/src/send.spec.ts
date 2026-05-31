import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';

import type { IngestPayload } from '@localsink/contract';

import { sendLog } from './send.ts';

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

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('sendLog', () => {
  it('POSTs the payload as JSON to the given endpoint', async () => {
    let received: unknown;
    server.use(
      http.post('http://localhost/api/logs', async ({ request }) => {
        received = await request.json();
        return HttpResponse.json({});
      }),
    );
    await sendLog('http://localhost/api/logs', FIXTURE);
    expect(received).toEqual(FIXTURE);
  });

  it('sets Content-Type to application/json', async () => {
    let contentType: string | null = null;
    server.use(
      http.post('http://localhost/api/logs', ({ request }) => {
        contentType = request.headers.get('content-type');
        return HttpResponse.json({});
      }),
    );
    await sendLog('http://localhost/api/logs', FIXTURE);
    expect(contentType).toBe('application/json');
  });

  it('does not throw when the endpoint is unreachable', async () => {
    server.use(
      http.post('http://localhost/api/logs', () => HttpResponse.error()),
    );
    await expect(
      sendLog('http://localhost/api/logs', FIXTURE),
    ).resolves.toBeUndefined();
  });

  it('does not throw when the server returns 500', async () => {
    server.use(
      http.post(
        'http://localhost/api/logs',
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    await expect(
      sendLog('http://localhost/api/logs', FIXTURE),
    ).resolves.toBeUndefined();
  });
});
